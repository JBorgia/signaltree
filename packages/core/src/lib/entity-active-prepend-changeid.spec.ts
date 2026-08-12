import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * Three collection capabilities added in 14.0.0 after a capability audit against
 * elf, Akita, `@ngrx/signals` and NGXS.
 *
 * - **prepend** — every other library in that audit had it; we were the only one
 *   without. `setAll([entity, ...existing])` is the workaround and it rebuilds
 *   every per-entity signal.
 * - **active entity** — elf and Akita both ship it, and every team otherwise
 *   hand-rolls `activeId` plus a derived lookup. Ours resolves through the
 *   per-entity signal rather than through the collection, so it is granular;
 *   that property is the point and is pinned below with recompute counts.
 * - **changeId** — the missing half of optimistic creation, and the one with a
 *   real limitation, so most of its tests are about the limitation.
 */
type Row = { id: number; v: number };

const mk = (rows: Row[] = [{ id: 1, v: 1 }, { id: 2, v: 2 }, { id: 3, v: 3 }]) => {
  const tree = signalTree({ r: entityMap<Row, number>({ selectId: (x) => x.id }) });
  tree.$.r.setAll(rows);
  return tree;
};
const ids = (t: ReturnType<typeof mk>) => t.$.r.ids().join(',');

describe('prepend', () => {
  it('prependOne puts the entity first', () => {
    const t = mk();
    t.$.r.prependOne({ id: 0, v: 0 });
    expect(ids(t)).toBe('0,1,2,3');
  });

  it('prependMany keeps the order it was given', () => {
    const t = mk();
    t.$.r.prependMany([{ id: -1, v: -1 }, { id: 0, v: 0 }]);
    expect(ids(t)).toBe('-1,0,1,2,3');
  });

  it('prepending into an empty collection works', () => {
    const t = mk([]);
    t.$.r.prependOne({ id: 9, v: 9 });
    expect(ids(t)).toBe('9');
  });

  it('rejects a duplicate id, like addOne', () => {
    const t = mk();
    expect(() => t.$.r.prependOne({ id: 2, v: 0 })).toThrow();
  });

  it('does NOT disturb other rows — a held node survives', () => {
    // The reason prepend exists rather than setAll: setAll resets every
    // per-entity signal, so every held node and every row's consumers churn.
    const t = mk();
    const held = t.$.r.byId(3);
    t.$.r.prependOne({ id: 0, v: 0 });
    expect(held?.().v).toBe(3);
    expect(t.$.r.byId(3)).toBe(held);
  });
});

describe('active entity', () => {
  it('resolves the selected row', () => {
    const t = mk();
    t.$.r.setActiveId(2);
    expect(t.$.r.activeEntity()?.v).toBe(2);
  });

  it('is undefined with no selection, and after clearing', () => {
    const t = mk();
    expect(t.$.r.activeEntity()).toBeUndefined();
    t.$.r.setActiveId(2);
    t.$.r.clearActiveId();
    expect(t.$.r.activeEntity()).toBeUndefined();
    expect(t.$.r.activeId()).toBeUndefined();
  });

  it('selecting a MISSING id is not an error — selection outlives the row', () => {
    // A delete arriving from a socket while a detail pane is open is normal.
    const t = mk();
    expect(() => t.$.r.setActiveId(999)).not.toThrow();
    expect(t.$.r.activeEntity()).toBeUndefined();
    expect(t.$.r.activeId()).toBe(999);
  });

  it('tracks writes to the ACTIVE row', () => {
    const t = mk();
    t.$.r.setActiveId(2);
    t.$.r.updateOne(2, { v: 22 });
    expect(t.$.r.activeEntity()?.v).toBe(22);
  });

  it('does NOT recompute when an UNRELATED row changes', () => {
    // The whole reason this is built in rather than left to the app: a
    // hand-rolled computed over all() recomputes on every collection change.
    const t = mk();
    t.$.r.setActiveId(2);
    let evaluations = 0;
    const active = computed(() => {
      evaluations++;
      return t.$.r.activeEntity()?.v;
    });
    active();
    const before = evaluations;

    t.$.r.updateOne(3, { v: 99 });
    active();

    expect(evaluations).toBe(before);
  });

  it('DOES recompute when the active row changes', () => {
    const t = mk();
    t.$.r.setActiveId(2);
    let evaluations = 0;
    const active = computed(() => {
      evaluations++;
      return t.$.r.activeEntity()?.v;
    });
    active();
    const before = evaluations;

    t.$.r.updateOne(2, { v: 22 });
    active();

    expect(evaluations).toBeGreaterThan(before);
  });

  it('follows a change of selection', () => {
    const t = mk();
    t.$.r.setActiveId(1);
    expect(t.$.r.activeEntity()?.v).toBe(1);
    t.$.r.setActiveId(3);
    expect(t.$.r.activeEntity()?.v).toBe(3);
  });

  it('goes undefined when the active row is removed', () => {
    const t = mk();
    t.$.r.setActiveId(2);
    t.$.r.removeOne(2);
    expect(t.$.r.activeEntity()).toBeUndefined();
  });
});

describe('changeId', () => {
  it('keeps the row in place', () => {
    const t = mk();
    t.$.r.changeId(2, 200);
    expect(ids(t)).toBe('1,200,3');
  });

  it('moves the entity, and the old id is gone', () => {
    const t = mk();
    t.$.r.changeId(2, 200);
    expect(t.$.r.byId(200)?.().v).toBe(2);
    expect(t.$.r.byId(2)).toBeUndefined();
    expect(t.$.r.count()).toBe(3);
  });

  it('carries the active selection across', () => {
    const t = mk();
    t.$.r.setActiveId(2);
    t.$.r.changeId(2, 200);
    expect(t.$.r.activeId()).toBe(200);
    expect(t.$.r.activeEntity()?.v).toBe(2);
  });

  it('leaves an unrelated active selection alone', () => {
    const t = mk();
    t.$.r.setActiveId(1);
    t.$.r.changeId(2, 200);
    expect(t.$.r.activeId()).toBe(1);
  });

  it('changing to the same id is a no-op', () => {
    const t = mk();
    t.$.r.changeId(2, 2);
    expect(ids(t)).toBe('1,2,3');
  });

  it('throws for a missing id', () => {
    expect(() => mk().$.r.changeId(999, 1)).toThrow(/not found/);
  });

  it('throws rather than clobbering an id already in use', () => {
    expect(() => mk().$.r.changeId(2, 3)).toThrow(/already in use/);
  });

  describe('the documented limitation', () => {
    it('a node held from the OLD id resolves to undefined', () => {
      // Not an oversight. A node closes over its id, so making it follow would
      // mean aliasing the old key to the same signal — and the next test is why
      // that would be worse.
      const t = mk();
      const held = t.$.r.byId(1);
      expect(held?.().v).toBe(1);

      t.$.r.changeId(1, 100);

      expect(held?.()).toBeUndefined();
      expect(t.$.r.byId(100)?.().v).toBe(1);
    });

    it('the freed id can be reused, and the two rows stay isolated', () => {
      // This is what an alias would have broken: one signal shared between two
      // different entities, which is a silent data-corruption bug rather than a
      // visibly empty node.
      const t = mk();
      t.$.r.changeId(1, 100);
      t.$.r.addOne({ id: 1, v: 555 });

      expect(t.$.r.byId(1)?.().v).toBe(555);
      expect(t.$.r.byId(100)?.().v).toBe(1);

      t.$.r.updateOne(1, { v: 777 });
      expect(t.$.r.byId(100)?.().v).toBe(1);
    });

    it('a naive path-derived position id aliases a different row after changeId and id reuse', () => {
      const t = mk([]);
      const tempId = -1;
      const naivePositionId = `r.${tempId}`;

      t.$.r.addOne({ id: tempId, v: 1 });
      t.$.r.changeId(tempId, 42);
      t.$.r.addOne({ id: tempId, v: 555 });

      const key = Number(naivePositionId.slice(naivePositionId.indexOf('.') + 1));

      // The string still names a CURRENT row, just not the ORIGINAL row.
      expect(t.$.r.byId(key)?.().v).toBe(555);
      expect(t.$.r.byId(42)?.().v).toBe(1);
    });
  });

  it('the optimistic-create flow end to end', () => {
    const t = mk([]);
    const tempId = -1;
    t.$.r.prependOne({ id: tempId, v: 0 });
    t.$.r.setActiveId(tempId);

    // server responds
    t.$.r.changeId(tempId, 42);
    t.$.r.updateOne(42, { v: 1 });

    expect(ids(t)).toBe('42');
    expect(t.$.r.activeId()).toBe(42);
    expect(t.$.r.activeEntity()?.v).toBe(1);
  });
});
