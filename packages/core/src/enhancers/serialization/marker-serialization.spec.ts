import { describe, expect, it } from 'vitest';

import { entityMap } from '../../lib/types';
import { form } from '../../lib/markers/form';
import { signalTree } from '../../lib/signal-tree';
import { serialization } from './serialization';

/**
 * `serialize()` → `deserialize()` with markers in the tree.
 *
 * This THREW for `status()` and `entityMap` — `targetSignal.set is not a
 * function` — and had since the markers existed. Two causes, both now gone:
 *
 *  1. `serialize()` had a PRIVATE second materialiser, `unwrapObjectSafely`,
 *     three hundred lines from `toJSON()` which already delegated to `tree()`.
 *     The enhancer disagreed with itself about what a snapshot is, and the
 *     private copy never learned the marker rule — so it emitted 17 keys for a
 *     `status()` node: 2 state, 6 computeds, and 9 setter METHODS.
 *  2. `deserialize()` then walked that payload and tried to `.set()` each key
 *     back. A computed has no setter, so the whole restore threw.
 *
 * `serialize()` now calls `tree()`, and `deserialize()` routes markers through
 * `hydrate` in `rehydrate` mode. The private walker is deleted — 133 lines.
 */
describe('serialization round-trips every marker', () => {
  const roundTrip = <T extends object>(build: () => T) => {
    const a = signalTree(build()).with(serialization());
    return { a, restore: () => {
      const json = a.serialize();
      const b = signalTree(build()).with(serialization());
      b.deserialize(json);
      return b;
    } };
  };

  // WITHDRAWN WITH STATUS-DEL — the status() serialization cases. Their subject
  // is marker external representation, UNPROVEN.

  it('entityMap()', () => {
    const { a, restore } = roundTrip(() => ({
      r: entityMap<{ id: number; v: string }, number>(),
    }));
    a.$.r.setAll([
      { id: 1, v: 'a' },
      { id: 2, v: 'b' },
    ]);
    const b = restore();
    expect(b.$.r.count()).toBe(2);
    expect(b.$.r.byId(2)?.()).toEqual({ id: 2, v: 'b' });
  });

});

describe('special types still survive — one materialiser, same result', () => {
  it('preserves Date, Map, Set, BigInt and RegExp, nested included', () => {
    // `unwrapObjectSafely` was kept on the grounds that serialize() "needs
    // type-preserving markers". That was never true: `tree()` returns LIVE
    // Date/Map/Set/RegExp/bigint instances and `encodeSpecials` does the
    // marking. This pins that deleting the private walker changed nothing here.
    const shape = () => ({
      d: new Date('2020-01-02T03:04:05.000Z'),
      m: new Map<string, number>([['a', 1]]),
      s: new Set<number>([1, 2]),
      big: BigInt('9007199254740993'),
      re: /ab+c/gi,
      nested: { d2: new Date(0) },
    });

    const a = signalTree(shape()).with(serialization());
    const b = signalTree(shape()).with(serialization());
    b.deserialize(a.serialize());

    expect(b.$.d().toISOString()).toBe('2020-01-02T03:04:05.000Z');
    expect(b.$.m() instanceof Map).toBe(true);
    expect([...b.$.m()]).toEqual([['a', 1]]);
    expect(b.$.s() instanceof Set).toBe(true);
    expect([...b.$.s()]).toEqual([1, 2]);
    expect(typeof b.$.big()).toBe('bigint');
    expect(b.$.re() instanceof RegExp).toBe(true);
    expect(b.$.re().source).toBe('ab+c');
    expect(b.$.nested.d2().toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});
