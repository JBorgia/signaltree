import { describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * `tree({ rows: [...] })` applies. It used to half-apply.
 *
 * A bare array is what a person or an AI writes to seed or reset a collection,
 * and `entityMap`'s hydrate only accepted `{ all: [...] }` — the shape a
 * SNAPSHOT emits. Given a bare array it fell through to the ST2024 warning and
 * left the collection untouched, while sibling leaves in the SAME payload took
 * their new values. That partial application is worse than a clean failure: the
 * parts that did apply make it look like it worked, and in a production build,
 * with the diagnostic folded away, there is nothing to see at all.
 *
 * The two shapes coexist rather than one replacing the other, so the tests that
 * matter here are the ones proving the bare array did NOT become a wildcard:
 * `{ all }` still round-trips, and a genuinely malformed payload is still
 * refused rather than silently accepted.
 */
type Row = { id: number; v: number };

const mk = () => {
  const tree = signalTree({
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    n: 0,
  });
  tree.$.rows.setAll([
    { id: 1, v: 1 },
    { id: 2, v: 2 },
  ]);
  return tree;
};

describe('a bare array is a valid payload', () => {
  it('replaces the collection', () => {
    const tree = mk();
    tree({ rows: [{ id: 9, v: 9 }], n: 5 });
    expect(tree.$.rows.all().map((r) => r.id)).toEqual([9]);
  });

  it('applies sibling leaves in the same payload — the half that always worked', () => {
    const tree = mk();
    tree({ rows: [{ id: 9, v: 9 }], n: 5 });
    expect(tree.$.n()).toBe(5);
  });

  it('an EMPTY array clears the collection rather than being ignored as falsy', () => {
    const tree = mk();
    tree({ rows: [], n: 1 });
    expect(tree.$.rows.count()).toBe(0);
  });

  it('adds, removes and reorders in one payload', () => {
    const tree = mk();
    tree({
      rows: [
        { id: 3, v: 3 },
        { id: 1, v: 11 },
      ],
      n: 0,
    });
    expect(tree.$.rows.all().map((r) => r.id)).toEqual([3, 1]);
    expect(tree.$.rows.byId(1)?.().v).toBe(11);
    expect(tree.$.rows.byId(2)).toBeUndefined();
  });
});

describe('the snapshot shape is unaffected', () => {
  it('{ all: [...] } still applies', () => {
    const tree = mk();
    tree({ rows: { all: [{ id: 7, v: 7 }] }, n: 3 });
    expect(tree.$.rows.all().map((r) => r.id)).toEqual([7]);
    expect(tree.$.n()).toBe(3);
  });

  it('a real snapshot round-trips', () => {
    const tree = mk();
    const snapshot = tree();

    tree.$.rows.addOne({ id: 3, v: 3 });
    tree.$.n.set(99);
    tree(snapshot);

    expect(tree.$.rows.all().map((r) => r.id)).toEqual([1, 2]);
    expect(tree.$.n()).toBe(0);
  });
});

describe('a malformed payload is still refused, not silently accepted', () => {
  it('an object with no `all` leaves the collection alone and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mk();

    tree({ rows: { nope: 1 } as never, n: 2 });

    expect(tree.$.rows.count()).toBe(2);
    expect(warn.mock.calls.flat().join(' ')).toContain('ST2024');
    warn.mockRestore();
  });

  it('a non-object payload is a no-op', () => {
    const tree = mk();
    tree({ rows: 42 as never, n: 2 });
    expect(tree.$.rows.count()).toBe(2);
  });
});
