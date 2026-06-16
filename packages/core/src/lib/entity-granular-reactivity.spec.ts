import { computed } from '@angular/core';

import { entityMap } from '../index';
import { signalTree } from './signal-tree';

/**
 * Guards for the per-entity signal layer (body-granular entityMap) and the
 * memory-safety fixes from code review: absent ids must stay reactive without
 * permanently materializing a signal, and removed ids must release theirs.
 */
interface Row {
  id: number;
  v: number;
}

function makeRows() {
  const tree = signalTree({ rows: entityMap<Row, number>() });
  return tree.$.rows as unknown as {
    addOne: (r: Row) => void;
    addMany: (r: Row[]) => void;
    updateOne: (id: number, patch: Partial<Row>) => void;
    removeOne: (id: number) => void;
    byId: (id: number) => { v: () => number | undefined } | undefined;
  };
}

describe('entityMap granular reactivity', () => {
  it('byId(absent) is reactive — re-runs when the entity appears', () => {
    const rows = makeRows();
    let runs = 0;
    const probe = computed(() => {
      runs++;
      return rows.byId(5)?.v() ?? -1;
    });
    expect(probe()).toBe(-1); // absent
    expect(runs).toBe(1);
    rows.addOne({ id: 5, v: 42 });
    expect(probe()).toBe(42); // appeared → re-ran
    expect(runs).toBe(2);
  });

  it('updating one entity does NOT re-run a reader of another (fan-out 1)', () => {
    const rows = makeRows();
    rows.addMany([
      { id: 1, v: 0 },
      { id: 2, v: 0 },
    ]);
    let aRuns = 0;
    const a = computed(() => {
      aRuns++;
      return rows.byId(1)?.v();
    });
    a(); // prime
    expect(aRuns).toBe(1);
    rows.updateOne(2, { v: 99 }); // touch the OTHER entity
    a();
    expect(aRuns).toBe(1); // not re-run
  });

  it('removal releases the entity: held reference reads undefined, byId absent', () => {
    const rows = makeRows();
    rows.addOne({ id: 1, v: 5 });
    const node = rows.byId(1);
    expect(node?.v()).toBe(5);
    rows.removeOne(1);
    expect(node?.v()).toBeUndefined(); // held ref sees it gone
    expect(rows.byId(1)).toBeUndefined();
  });

  it('re-add after removal works through a fresh byId', () => {
    const rows = makeRows();
    rows.addOne({ id: 1, v: 5 });
    rows.removeOne(1);
    rows.addOne({ id: 1, v: 7 });
    expect(rows.byId(1)?.v()).toBe(7);
  });
});
