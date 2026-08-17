import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * `EntityConfig.hooks` and `tap({ onChange })`, implemented in 14.1.2.
 *
 * All four were declared in the Dec 2025 types-only commit that introduced the
 * Map-based entity API and were never wired into any of the five generations of
 * `entity-signal.ts` that followed. They compiled, read as working guards, and
 * did nothing — `entityMap({ hooks: { beforeRemove: () => false } })` removed
 * the entity anyway.
 *
 * Blocking THROWS rather than skipping, matching `intercept()`'s `ctx.block()`.
 * A guard that declines a mutation in silence is the defect class this codebase
 * carries ST2008/ST2022/ST2023 for, and a skip could not be reported through
 * `addOne`'s `K` return in any case.
 */
interface Row {
  id: string;
  v: number;
}

const rows = (): Row[] => [
  { id: 'a', v: 1 },
  { id: 'b', v: 2 },
  { id: 'c', v: 3 },
];

describe('beforeAdd', () => {
  it('transforms the entity that gets stored', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeAdd: (e) => ({ ...e, v: e.v * 10 }) },
      }),
    });
    tree.$.rows.addOne({ id: 'a', v: 1 });
    expect(tree.$.rows.byIdOrFail('a').v()).toBe(10);
  });

  it('blocks by throwing, leaving the collection untouched', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeAdd: (e) => (e.v < 0 ? false : e) },
      }),
    });
    expect(() => tree.$.rows.addOne({ id: 'a', v: -1 })).toThrow(/beforeAdd/);
    expect(tree.$.rows.ids()).toEqual([]);
  });

  it('a blocked entity in addMany aborts the WHOLE batch', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeAdd: (e) => (e.id === 'c' ? false : e) },
      }),
    });
    expect(() => tree.$.rows.addMany(rows())).toThrow(/beforeAdd/);
    // Atomic: 'a' and 'b' were valid but must not be half-applied.
    expect(tree.$.rows.ids()).toEqual([]);
  });
});

describe('beforeUpdate', () => {
  it('transforms the changes that get applied', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeUpdate: (_id, changes) => ({ ...changes, v: 99 }) },
      }),
    });
    tree.$.rows.addOne({ id: 'a', v: 1 });
    tree.$.rows.updateOne('a', { v: 2 });
    expect(tree.$.rows.byIdOrFail('a').v()).toBe(99);
  });

  it('blocks by throwing', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeUpdate: () => false },
      }),
    });
    tree.$.rows.addOne({ id: 'a', v: 1 });
    expect(() => tree.$.rows.updateOne('a', { v: 2 })).toThrow(/beforeUpdate/);
    expect(tree.$.rows.byIdOrFail('a').v()).toBe(1);
  });

  it('a blocked update in updateMany aborts the whole batch', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeUpdate: (id) => (id === 'c' ? false : { v: 0 }) },
      }),
    });
    tree.$.rows.addMany(rows());
    expect(() => tree.$.rows.updateMany(['a', 'b', 'c'], { v: 0 })).toThrow(
      /beforeUpdate/
    );
    expect(tree.$.rows.byIdOrFail('a').v()).toBe(1);
  });
});

describe('beforeRemove', () => {
  it('blocks a removal that would otherwise succeed', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeRemove: () => false },
      }),
    });
    tree.$.rows.addOne({ id: 'a', v: 1 });
    expect(() => tree.$.rows.removeOne('a')).toThrow(/beforeRemove/);
    expect(tree.$.rows.ids()).toEqual(['a']);
  });

  it('guards clear() too — the path that used to bypass everything', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeRemove: (id) => id !== 'b' },
      }),
    });
    tree.$.rows.addMany(rows());
    expect(() => tree.$.rows.clear()).toThrow(/beforeRemove/);
    expect(tree.$.rows.ids()).toEqual(['a', 'b', 'c']);
  });

  it('guards the evictions in setAll', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        hooks: { beforeRemove: () => false },
      }),
    });
    tree.$.rows.addMany(rows());
    expect(() => tree.$.rows.setAll([{ id: 'a', v: 1 }])).toThrow(
      /beforeRemove/
    );
    expect(tree.$.rows.ids()).toEqual(['a', 'b', 'c']);
  });
});

describe('tap({ onRemove }) now covers every removal path', () => {
  function harness(hooks?: Parameters<typeof entityMap<Row, string>>[0]) {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id, ...hooks }),
    });
    const removed: string[] = [];
    tree.$.rows.tap({ onRemove: (id) => removed.push(String(id)) });
    tree.$.rows.addMany(rows());
    return { rows: tree.$.rows, removed };
  }

  it('removeOne / removeMany / removeWhere (unchanged)', () => {
    const a = harness();
    a.rows.removeOne('a');
    expect(a.removed).toEqual(['a']);

    const b = harness();
    b.rows.removeMany(['a', 'b']);
    expect(b.removed).toEqual(['a', 'b']);

    const c = harness();
    c.rows.removeWhere((r) => r.v > 1);
    expect(c.removed).toEqual(['b', 'c']);
  });

  it('clear() fires for every entity — the leak this closes', () => {
    const h = harness();
    h.rows.clear();
    expect(h.removed.sort()).toEqual(['a', 'b', 'c']);
  });

  it('clear() on an empty collection is a no-op', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    let changes = 0;
    tree.$.rows.tap({ onChange: () => changes++ });
    tree.$.rows.clear();
    expect(changes).toBe(0);
  });

  it('setAll fires onRemove for entities it EVICTS', () => {
    const h = harness();
    h.rows.setAll([{ id: 'a', v: 9 }]);
    expect(h.removed.sort()).toEqual(['b', 'c']);
  });

  it('setAll does NOT evict an entity present on both sides', () => {
    const h = harness();
    h.rows.setAll(rows());
    expect(h.removed).toEqual([]);
  });
});

describe('tap({ onChange })', () => {
  function harness() {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    let changes = 0;
    tree.$.rows.tap({ onChange: () => changes++ });
    return { rows: tree.$.rows, count: () => changes };
  }

  it('fires once per mutation, not once per entity', () => {
    const h = harness();
    h.rows.addMany(rows());
    expect(h.count()).toBe(1);

    h.rows.updateMany(['a', 'b'], { v: 0 });
    expect(h.count()).toBe(2);

    h.rows.removeMany(['a', 'b']);
    expect(h.count()).toBe(3);
  });

  it('fires for every mutation kind', () => {
    const h = harness();
    h.rows.addOne({ id: 'a', v: 1 });
    h.rows.updateOne('a', { v: 2 });
    h.rows.replaceOne('a', { id: 'a', v: 3 });
    h.rows.upsertOne({ id: 'b', v: 1 });
    h.rows.setAll([{ id: 'c', v: 1 }]);
    h.rows.clear();
    expect(h.count()).toBe(6);
  });

  it('unsubscribing stops it', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    let changes = 0;
    const off = tree.$.rows.tap({ onChange: () => changes++ });
    tree.$.rows.addOne({ id: 'a', v: 1 });
    off();
    tree.$.rows.addOne({ id: 'b', v: 2 });
    expect(changes).toBe(1);
  });
});
