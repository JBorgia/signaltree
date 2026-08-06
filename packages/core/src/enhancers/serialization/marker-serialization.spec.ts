import { describe, expect, it } from 'vitest';

import { entityMap } from '../../lib/types';
import { form } from '../../lib/markers/form';
import { LoadingState, status } from '../../lib/markers/status';
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

  it('status()', () => {
    const { a, restore } = roundTrip(() => ({ j: status<string>() }));
    a.$.j.setError('boom');
    const b = restore();
    expect(b.$.j.state()).toBe(LoadingState.Error);
    expect(b.$.j.error()).toBe('boom');
  });

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

  it('form()', () => {
    const { a, restore } = roundTrip(() => ({
      f: form({ initial: { name: '' } }),
    }));
    a.$.f.set({ name: 'Ada' });
    const b = restore();
    expect(b.$.f()).toEqual({ name: 'Ada' });
  });

  it('a mixed tree, all at once', () => {
    const { a, restore } = roundTrip(() => ({
      j: status(),
      r: entityMap<{ id: number }, number>(),
      f: form({ initial: { a: 0 } }),
      n: 0,
    }));
    a.$.j.setLoaded();
    a.$.r.setAll([{ id: 1 }]);
    a.$.f.set({ a: 7 });
    a.$.n.set(3);

    const b = restore();
    expect(b.$.j.state()).toBe(LoadingState.Loaded);
    expect(b.$.r.count()).toBe(1);
    expect(b.$.f().a).toBe(7);
    expect(b.$.n()).toBe(3);
  });

  it('normalises LOADING — deserialize crosses a process boundary', () => {
    // The one place `rehydrate` differs from `restore`. A fetch in flight when
    // the payload was written is not in flight in a new process, and believing
    // it deadlocks every guard: loading() true blocks "don't fetch while
    // loading", idle() false blocks an idle-gated fetch.
    const { a, restore } = roundTrip(() => ({ j: status() }));
    a.$.j.setLoading();
    const b = restore();
    expect(b.$.j.state()).toBe(LoadingState.NotLoaded);
    expect(b.$.j.idle()).toBe(true);
  });

  it('drops form touched — Angular form.value omits it too', () => {
    const { a, restore } = roundTrip(() => ({
      f: form({ initial: { a: '', b: '' } }),
    }));
    a.$.f.set({ a: 'x' });
    a.$.f.touch('a');
    expect(a.$.f.touched().a).toBe(true);

    const b = restore();
    expect(b.$.f().a).toBe('x'); // the value survives
    expect(b.$.f.touched().a).toBe(false); // the interaction state does not
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
