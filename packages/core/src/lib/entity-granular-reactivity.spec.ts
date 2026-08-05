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

describe('entityMap — collection queries are lazily derived (13.5.0)', () => {
  it('a single-entity update does not rebuild the collection', () => {
    // updateSignals() used to run on EVERY mutation and do three full copies of
    // the collection: Array.from(values), Array.from(keys), new Map(storage).
    // That made updateOne O(size) — 2.8ms on a 50k collection — which defeats
    // the point of Map-backed storage whose write is O(1).
    const tree = signalTree({
      rows: entityMap<{ id: number; v: number }, number>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.rows.setAll(
      Array.from({ length: 20000 }, (_, i) => ({ id: i, v: 0 }))
    );

    const t0 = performance.now();
    for (let i = 0; i < 200; i++) tree.$.rows.updateOne(i, { v: 1 });
    const perUpdate = (performance.now() - t0) / 200;

    // O(1) is microseconds; the old O(size) path was ~0.5ms at this size.
    // The bound is deliberately loose — this pins the COMPLEXITY, not a
    // machine-specific number.
    expect(perUpdate).toBeLessThan(0.05);
    expect(tree.$.rows.byId(5)?.().v).toBe(1);
  });

  it('repeated collection reads between writes are cached', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number }, number>({ selectId: (r) => r.id }),
    });
    tree.$.rows.setAll(Array.from({ length: 20000 }, (_, i) => ({ id: i })));

    tree.$.rows.all(); // prime
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) tree.$.rows.all();
    expect(performance.now() - t0).toBeLessThan(5);
  });

  it('map() stays a snapshot, not a live view', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number; v: string }, number>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.rows.setAll([{ id: 1, v: 'a' }]);

    const held = tree.$.rows.map();
    tree.$.rows.updateOne(1, { v: 'z' });

    expect(held.get(1)?.v).toBe('a');
    expect(tree.$.rows.map().get(1)?.v).toBe('z');
  });
});

describe('entityMap — a held node reference survives collection churn', () => {
  it('reads again after the entity is removed and re-added', () => {
    // Holding a reference to a nested position is the capability SignalTree has
    // that immutable stores do not. Capturing the per-entity signal once made a
    // held node permanently dead across remove -> re-add: removal deletes the
    // signal, the re-add creates a new one, and the held reference kept reading
    // the orphan — undefined forever, while a fresh byId() worked.
    const tree = signalTree({
      rows: entityMap<{ id: number; v: string }, number>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.rows.setAll([{ id: 1, v: 'a' }]);

    const held = tree.$.rows.byId(1);
    expect(held?.().v).toBe('a');

    tree.$.rows.removeOne(1);
    expect(held?.()).toBeUndefined(); // gone, correctly

    tree.$.rows.addOne({ id: 1, v: 'b' });
    expect(held?.().v).toBe('b'); // and it comes back
    expect(tree.$.rows.byId(1)?.().v).toBe('b');
  });

  it('a held FIELD reference also recovers', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number; v: string }, number>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.rows.setAll([{ id: 1, v: 'a' }]);

    const field = (tree.$.rows.byId(1) as unknown as { v: () => string }).v;
    expect(field()).toBe('a');

    tree.$.rows.removeOne(1);
    tree.$.rows.addOne({ id: 1, v: 'b' });

    expect(field()).toBe('b');
  });
});
