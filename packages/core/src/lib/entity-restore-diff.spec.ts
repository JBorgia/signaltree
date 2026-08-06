import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { hydrateMarkerNode } from './internals/materialize-markers';
import { signalTree } from './signal-tree';

/**
 * `entityMap` restore takes a DIFF fast path, with `setAll` as the fallback.
 *
 * Restoring used to call `setAll` unconditionally — rebuilding the storage map,
 * the id index and every per-entity signal on every undo. Measured at 10,000
 * entities that was 3.62 ms per restore, and it made undo/redo over a large
 * collection ~150x slower than elf's state-history, which restores by swapping
 * one immutable reference.
 *
 * A snapshot SHARES its entity objects with the live tree (measured 499/500
 * identical after a single-entity edit), so a reference walk finds exactly the
 * rows that moved. Undo went 4,368 us -> 237 us per undo, 18x.
 *
 * These tests exist for the fallback, not the fast path. A shortcut that is
 * wrong about WHEN it applies would silently corrupt a restore, which is the
 * exact defect class 14.0.0 was about — so every shape that must NOT take it
 * is pinned here.
 */
type Row = { id: number; v: number };

const mk = (rows: Row[]) => {
  const tree = signalTree({
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
  });
  tree.$.rows.setAll(rows);
  return tree;
};

describe('restore takes the diff fast path when the shape is unchanged', () => {
  it('a single changed entity restores, and the rest are untouched', () => {
    const tree = mk([
      { id: 1, v: 1 },
      { id: 2, v: 2 },
      { id: 3, v: 3 },
    ]);
    const before = tree.$.rows.byId(2);

    hydrateMarkerNode(
      tree.$.rows,
      { all: [{ id: 1, v: 1 }, { id: 2, v: 99 }, { id: 3, v: 3 }] },
      'restore'
    );

    expect(tree.$.rows.byId(2)?.().v).toBe(99);
    expect(tree.$.rows.byId(1)?.().v).toBe(1);
    expect(tree.$.rows.count()).toBe(3);
    // The held reference must still resolve — a rebuild would orphan it.
    expect(before?.().v).toBe(99);
  });

  it('an identical payload is a no-op that still leaves state correct', () => {
    const rows = [
      { id: 1, v: 1 },
      { id: 2, v: 2 },
    ];
    const tree = mk(rows);
    hydrateMarkerNode(tree.$.rows, { all: tree.$.rows.all() }, 'restore');

    expect(tree.$.rows.all()).toEqual(rows);
    expect(tree.$.rows.count()).toBe(2);
  });
});

describe('the fallback — every shape the fast path must NOT handle', () => {
  it('an ADDED entity falls back and restores exactly', () => {
    const tree = mk([
      { id: 1, v: 1 },
      { id: 2, v: 2 },
    ]);

    hydrateMarkerNode(
      tree.$.rows,
      { all: [{ id: 1, v: 1 }, { id: 2, v: 2 }, { id: 3, v: 3 }] },
      'restore'
    );

    expect(tree.$.rows.count()).toBe(3);
    expect(tree.$.rows.byId(3)?.().v).toBe(3);
  });

  it('a REMOVED entity falls back and restores exactly', () => {
    const tree = mk([
      { id: 1, v: 1 },
      { id: 2, v: 2 },
      { id: 3, v: 3 },
    ]);

    hydrateMarkerNode(tree.$.rows, { all: [{ id: 1, v: 1 }, { id: 3, v: 3 }] }, 'restore');

    expect(tree.$.rows.count()).toBe(2);
    expect(tree.$.rows.byId(2)).toBeUndefined();
    expect(tree.$.rows.all().map((r) => r.id)).toEqual([1, 3]);
  });

  it('a REORDER falls back and preserves the payload order', () => {
    const tree = mk([
      { id: 1, v: 1 },
      { id: 2, v: 2 },
      { id: 3, v: 3 },
    ]);

    hydrateMarkerNode(
      tree.$.rows,
      { all: [{ id: 3, v: 3 }, { id: 1, v: 1 }, { id: 2, v: 2 }] },
      'restore'
    );

    expect(tree.$.rows.all().map((r) => r.id)).toEqual([3, 1, 2]);
    expect(tree.$.rows.count()).toBe(3);
  });

  it('SAME LENGTH but DIFFERENT IDS is the dangerous case — count guard repairs it', () => {
    // Equal length means the fast path is attempted. `upsertOne` resolves the id
    // itself, so a row whose id changed is ADDED rather than replaced and the
    // count moves — which is what the guard watches, falling back to a full
    // rebuild rather than leaving a half-applied restore.
    const tree = mk([
      { id: 1, v: 1 },
      { id: 2, v: 2 },
    ]);

    hydrateMarkerNode(
      tree.$.rows,
      { all: [{ id: 7, v: 7 }, { id: 8, v: 8 }] },
      'restore'
    );

    expect(tree.$.rows.count()).toBe(2);
    expect(tree.$.rows.all().map((r) => r.id)).toEqual([7, 8]);
    expect(tree.$.rows.byId(1)).toBeUndefined();
    expect(tree.$.rows.byId(7)?.().v).toBe(7);
  });

  it('restoring into an EMPTY collection works', () => {
    const tree = mk([]);
    hydrateMarkerNode(tree.$.rows, { all: [{ id: 1, v: 1 }] }, 'restore');
    expect(tree.$.rows.count()).toBe(1);
  });

  it('restoring an EMPTY payload clears the collection', () => {
    const tree = mk([{ id: 1, v: 1 }]);
    hydrateMarkerNode(tree.$.rows, { all: [] }, 'restore');
    expect(tree.$.rows.count()).toBe(0);
  });
});

describe('undo/redo end to end still reverts a large collection', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('50 edits then 50 undos returns the probe row to its original value', async () => {
    const N = 300;
    const rows: Row[] = [];
    for (let i = 0; i < N; i++) rows.push({ id: i, v: i });
    const { timeTravel } = await import('../enhancers/time-travel/time-travel');
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    }).with(timeTravel({ maxHistorySize: 100 }));
    tree.$.rows.setAll(rows);
    await flush();

    for (let i = 0; i < 50; i++) {
      tree.$.rows.updateOne(0, { v: 900_000 + i });
      await flush();
    }
    expect(tree.$.rows.byId(0)?.().v).toBe(900_049);

    for (let i = 0; i < 50; i++) {
      tree.undo();
      await flush();
    }

    expect(tree.$.rows.byId(0)?.().v).toBe(0);
    expect(tree.$.rows.count()).toBe(N);
  });
});
