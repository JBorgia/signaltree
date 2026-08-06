import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * A marker's snapshot wrapper is REFERENCE STABLE across unrelated writes.
 *
 * `unwrap` rebuilds a parent whenever any child changes, and it used to call
 * `snapshotMarkerNode` unmemoised — `isMemoisable` recognises tree stores and
 * node accessors, not marker nodes. So writing an unrelated leaf allocated a
 * fresh `{ value }` wrapper for every marker in the tree, and
 * `tree().rows !== previous.rows` even though the collection had not changed.
 *
 * The `all` array inside it was already stable, so nothing was WRONG — which is
 * why this survived. It is the wrapper alone, and a wrapper is enough: a
 * `computed(() => tree().rows)` recomputes on identity, and an OnPush component
 * bound to the whole marker re-renders. At that point the granular reactivity
 * this library exists for has been given away one level above the collection.
 *
 * The memo is a `computed` rather than a hand-rolled cache because the snapshot
 * reads the marker's own signals, so Angular's graph already knows precisely
 * when it is stale. That makes the "still invalidates" tests below the load
 * bearing ones — a memo that never invalidated would pass a stability test and
 * serve permanently stale state.
 */
type Row = { id: number; v: number };

const mk = () => {
  const tree = signalTree({
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    unrelated: 0,
  });
  tree.$.rows.setAll([
    { id: 1, v: 1 },
    { id: 2, v: 2 },
  ]);
  return tree;
};

describe('stability', () => {
  it('repeated reads with no write return the identical wrapper', () => {
    const tree = mk();
    expect(tree().rows).toBe(tree().rows);
  });

  it('an UNRELATED write does not re-allocate the wrapper', () => {
    const tree = mk();
    const before = tree().rows;

    tree.$.unrelated.set(1);

    expect(tree().rows).toBe(before);
  });

  it('many unrelated writes still return the original wrapper', () => {
    const tree = mk();
    const before = tree().rows;

    for (let i = 0; i < 50; i++) tree.$.unrelated.set(i);

    expect(tree().rows).toBe(before);
  });
});

describe('invalidation — the half a broken memo would pass', () => {
  it('updateOne invalidates the wrapper and shows the new value', () => {
    const tree = mk();
    const before = tree().rows;

    tree.$.rows.updateOne(2, { v: 99 });

    const after = tree().rows;
    expect(after).not.toBe(before);
    expect(after.all.find((r) => r.id === 2)?.v).toBe(99);
  });

  it('addOne invalidates', () => {
    const tree = mk();
    const before = tree().rows;
    tree.$.rows.addOne({ id: 3, v: 3 });
    expect(tree().rows).not.toBe(before);
    expect(tree().rows.all).toHaveLength(3);
  });

  it('removeOne invalidates', () => {
    const tree = mk();
    const before = tree().rows;
    tree.$.rows.removeOne(1);
    expect(tree().rows).not.toBe(before);
    expect(tree().rows.all).toHaveLength(1);
  });

  it('setAll invalidates', () => {
    const tree = mk();
    const before = tree().rows;
    tree.$.rows.setAll([{ id: 9, v: 9 }]);
    expect(tree().rows).not.toBe(before);
    expect(tree().rows.all.map((r) => r.id)).toEqual([9]);
  });
});

describe('an already-taken snapshot is never mutated retroactively', () => {
  it('the previous wrapper keeps the values it was taken with', () => {
    const tree = mk();
    const before = tree().rows;

    tree.$.rows.updateOne(2, { v: 99 });

    expect(before.all.find((r) => r.id === 2)?.v).toBe(2);
    expect(tree().rows.all.find((r) => r.id === 2)?.v).toBe(99);
  });
});

describe('two markers memoise independently', () => {
  it('writing one collection leaves the other stable', () => {
    const tree = signalTree({
      a: entityMap<Row, number>({ selectId: (r) => r.id }),
      b: entityMap<Row, number>({ selectId: (r) => r.id }),
    });
    tree.$.a.setAll([{ id: 1, v: 1 }]);
    tree.$.b.setAll([{ id: 1, v: 1 }]);
    const beforeB = tree().b;

    tree.$.a.addOne({ id: 2, v: 2 });

    expect(tree().b).toBe(beforeB);
    expect(tree().a.all).toHaveLength(2);
  });
});

describe('two trees do not share a memo', () => {
  it('each tree reports its own collection', () => {
    const one = mk();
    const two = mk();
    two.$.rows.updateOne(1, { v: 111 });

    expect(one().rows.all.find((r) => r.id === 1)?.v).toBe(1);
    expect(two().rows.all.find((r) => r.id === 1)?.v).toBe(111);
    expect(one().rows).not.toBe(two().rows);
  });
});
