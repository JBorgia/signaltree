import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * `byId()`'s node cache holds nodes WEAKLY.
 *
 * A node materialised by `byId()` lets one row be bound and written
 * independently — the point of granular reactivity. The cache used to be a
 * strong `Map`, so READING permanently allocated: entries were dropped on
 * mutation or removal, but nothing bounded growth from reads.
 *
 * Measured at 10,000 entities: 315 B/entity for the collection, and
 * **4,149 B/entity once `byId()` had been called on every row** — 3.0 MB
 * against 39.6 MB. That is the documented pattern for granular updates, so the
 * recommended usage was the expensive one. With a weak cache the same walk
 * costs 844 B/entity, 8.05 MB — 4.9x less.
 *
 * These tests cover the OBSERVABLE contract, which weakness must not change.
 * Collection itself is not asserted (it needs `--expose-gc` and is inherently
 * non-deterministic); what matters is that no caller can tell the difference.
 */
type Row = { id: number; v: number };

const mk = (n = 5) => {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) rows.push({ id: i, v: i });
  const tree = signalTree({
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
  });
  tree.$.rows.setAll(rows);
  return tree;
};

describe('a HELD node behaves exactly as before', () => {
  it('repeated byId returns the identical node while it is held', () => {
    const tree = mk();
    const a = tree.$.rows.byId(2);
    const b = tree.$.rows.byId(2);
    expect(a).toBe(b);
  });

  it('a held node sees writes made through the collection', () => {
    const tree = mk();
    const node = tree.$.rows.byId(2);

    tree.$.rows.updateOne(2, { v: 99 });

    expect(node?.().v).toBe(99);
  });

  it('a held node stays tombstoned when the same key is later reused', () => {
    // Weak caching must not revive the removed subject if a later add reuses
    // the same key for a different subject.
    const tree = mk();
    const node = tree.$.rows.byId(2);
    expect(node?.().v).toBe(2);

    tree.$.rows.removeOne(2);
    tree.$.rows.addOne({ id: 2, v: 42 });

    expect(node?.()).toBeUndefined();
    expect(tree.$.rows.byId(2)?.().v).toBe(42);
  });

  it('holding many nodes keeps all of them live and correct', () => {
    const tree = mk(50);
    const held = [];
    for (let i = 0; i < 50; i++) held.push(tree.$.rows.byId(i));

    tree.$.rows.updateOne(7, { v: 777 });
    tree.$.rows.updateOne(11, { v: 111 });

    expect(held[7]?.().v).toBe(777);
    expect(held[11]?.().v).toBe(111);
    expect(held[0]?.().v).toBe(0);
  });
});

describe('an UNHELD node is indistinguishable after being rebuilt', () => {
  it('a fresh byId after dropping the reference reads the current value', () => {
    const tree = mk();
    // Drop it. Whether the old node was collected is not observable — the
    // contract is that the next byId reads correctly either way.
    void tree.$.rows.byId(3);

    tree.$.rows.updateOne(3, { v: 300 });

    expect(tree.$.rows.byId(3)?.().v).toBe(300);
  });

  it('reading every row repeatedly stays correct', () => {
    const tree = mk(100);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 100; i++) {
        expect(tree.$.rows.byId(i)?.().v).toBe(i);
      }
    }
  });

  it('byId for a missing entity is undefined, before and after churn', () => {
    const tree = mk();
    expect(tree.$.rows.byId(999)).toBeUndefined();

    tree.$.rows.removeOne(1);
    expect(tree.$.rows.byId(1)).toBeUndefined();
  });
});
