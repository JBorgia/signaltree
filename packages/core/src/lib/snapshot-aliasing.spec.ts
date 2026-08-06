import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';

/**
 * A snapshot is read-only ALL THE WAY DOWN — contract, not enforcement.
 *
 * The dev-mode freeze is per NODE. `snapshot.a = x` throws;
 * `snapshot.someDate.setFullYear(1999)` does not, and it corrupts live state,
 * because a leaf holding a `Date`, `Map`, `Set` or `Array` is handed out BY
 * REFERENCE. Only plain object leaves are copied.
 *
 * These tests PIN that rather than claim it is fixed, because the two available
 * fixes both fail on measurement:
 *
 *  - Copying leaf values costs +54µs against 1.0µs on a 50k array — 55×, which
 *    is exactly the materialisation tax the memo exists to remove, paid on
 *    every read.
 *  - Freezing them does not work. `Object.freeze` protects `Array.push` and
 *    nothing else here: `Date.setFullYear`, `Map.set` and `Set.add` mutate
 *    through internal slots and ignore it. It would also freeze LIVE state,
 *    since the value is shared.
 *
 * If either of those trade-offs changes, these tests are where the decision is
 * recorded and where it should be revisited.
 */
describe('snapshot aliasing — the documented shape of the contract', () => {
  it('hands out mutable built-ins by reference', () => {
    const tree = signalTree({
      d: new Date('2020-01-01T00:00:00Z'),
      m: new Map<string, number>([['a', 1]]),
      s: new Set<number>([1]),
      arr: [1, 2, 3],
    });
    const snap = tree();

    expect(snap.d).toBe(tree.$.d());
    expect(snap.m).toBe(tree.$.m());
    expect(snap.s).toBe(tree.$.s());
    expect(snap.arr).toBe(tree.$.arr());
  });

  it('copies plain object leaves, so those cannot alias', () => {
    const held = { nested: { n: 1 } };
    const tree = signalTree({ obj: { held } });
    const snap = tree() as { obj: { held: typeof held } };

    expect(snap.obj.held).not.toBe(held);
    expect(snap.obj.held).toEqual(held);
  });

  it('MUTATING A SNAPSHOT VALUE CORRUPTS LIVE STATE — do not do this', () => {
    const tree = signalTree({
      d: new Date('2020-01-01T00:00:00Z'),
      m: new Map<string, number>([['a', 1]]),
      s: new Set<number>([1]),
    });
    const snap = tree();

    snap.d.setFullYear(1999);
    snap.m.set('b', 2);
    snap.s.add(99);

    // Documented, not desired. This is the same class of mistake as mutating a
    // signal's value in place, which is already ST2003.
    expect(tree.$.d().getFullYear()).toBe(1999);
    expect(tree.$.m().size).toBe(2);
    expect(tree.$.s().size).toBe(2);
  });

  it('the node-level freeze still catches the common mistake', () => {
    const tree = signalTree({ a: { x: 1 } });
    const snap = tree();

    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.a)).toBe(true);
    expect(() => {
      (snap as unknown as Record<string, unknown>)['a'] = 'nope';
    }).toThrow(TypeError);
  });

  it('freeze cannot protect Date/Map/Set even if we applied it', () => {
    // The measurement behind the decision, kept executable: freezing is not a
    // cheaper alternative to copying, it is a non-solution for these types.
    const d = Object.freeze(new Date(0));
    const m = Object.freeze(new Map<string, number>());
    const s = Object.freeze(new Set<number>());

    expect(() => d.setFullYear(1999)).not.toThrow();
    expect(d.getFullYear()).toBe(1999);
    expect(() => m.set('a', 1)).not.toThrow();
    expect(m.size).toBe(1);
    expect(() => s.add(1)).not.toThrow();
    expect(s.size).toBe(1);
  });
});
