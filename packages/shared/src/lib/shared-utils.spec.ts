import { describe, expect, it } from 'vitest';

import { deepClone } from './deep-clone';
import { getChanges } from './get-changes';
import { isGlobKey, matchPath } from './match-path';
import { mergeDeep } from './merge-deep';

/**
 * `@signaltree/shared` was at 51% with three files at ZERO.
 *
 * These are the small pure functions the rest of the workspace is built on —
 * path matching decides which subscriber hears a change, `getChanges` decides
 * what a diff reports, `mergeDeep` decides what a partial write preserves. A
 * quiet wrong answer in any of them surfaces somewhere else entirely, which is
 * the worst kind to debug and the best kind to pin.
 */
describe('deepClone', () => {
  it('clones nested objects by value', () => {
    const original = { a: { b: { c: 1 } } };
    const copy = deepClone(original);

    copy.a.b.c = 2;

    expect(original.a.b.c).toBe(1);
  });

  it('clones arrays', () => {
    const original = [{ n: 1 }, { n: 2 }];
    const copy = deepClone(original);
    copy[0].n = 99;
    expect(original[0].n).toBe(1);
  });

  it('preserves Date, Map and Set as their own types', () => {
    const copy = deepClone({
      when: new Date(0),
      map: new Map([['k', 1]]),
      set: new Set([1, 2]),
    });

    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.map).toBeInstanceOf(Map);
    expect(copy.set).toBeInstanceOf(Set);
    expect(copy.map.get('k')).toBe(1);
  });

  it('passes primitives and null straight through', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('s')).toBe('s');
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });

  it('survives a CYCLE rather than recursing forever', () => {
    // The case that turns a utility into a hang.
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic['self'] = cyclic;

    const copy = deepClone(cyclic) as Record<string, unknown>;

    expect(copy['name']).toBe('root');
    expect(copy['self']).toBe(copy);
  });

  it('treats functions as opaque references', () => {
    const fn = () => 1;
    const copy = deepClone({ fn });
    expect(copy.fn).toBe(fn);
  });

  describe('the MANUAL fallback', () => {
    /**
     * `structuredClone` handles almost everything, so the hand-written cloner
     * below it was 47% covered — the branches for Date, Map, Set and Array
     * never ran, because the fast path took every case first.
     *
     * `structuredClone` THROWS on a function, and `deepClone` catches that and
     * falls through. So a payload carrying a function alongside the interesting
     * types is what exercises the fallback, without stubbing a global or
     * resetting the module registry.
     */
    const forceFallback = <T>(value: T) => deepClone({ fn: () => 1, value }).value;

    it('clones a Date through the fallback', () => {
      const cloned = forceFallback(new Date(1234));
      expect(cloned).toBeInstanceOf(Date);
      expect(cloned.getTime()).toBe(1234);
    });

    it('clones a Map through the fallback', () => {
      const cloned = forceFallback(new Map([['k', { n: 1 }]]));
      expect(cloned).toBeInstanceOf(Map);
      expect(cloned.get('k')).toEqual({ n: 1 });
      expect(cloned.get('k')).not.toBe(undefined);
    });

    it('clones a Set through the fallback', () => {
      const cloned = forceFallback(new Set([1, 2, 3]));
      expect(cloned).toBeInstanceOf(Set);
      expect([...cloned]).toEqual([1, 2, 3]);
    });

    it('clones an Array deeply through the fallback', () => {
      const source = [{ n: 1 }, { n: 2 }];
      const cloned = forceFallback(source);
      cloned[0].n = 99;
      expect(source[0].n).toBe(1);
    });

    it('handles a cycle through the fallback', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic['self'] = cyclic;
      const cloned = forceFallback(cyclic) as Record<string, unknown>;
      expect(cloned['self']).toBe(cloned);
    });
  });
});

describe('matchPath', () => {
  it('matches an exact path', () => {
    expect(matchPath('a.b.c', 'a.b.c')).toBe(true);
  });

  it('does not match a different path', () => {
    expect(matchPath('a.b.c', 'a.b.d')).toBe(false);
  });

  it('a `*` matches any ONE segment', () => {
    expect(matchPath('a.*.c', 'a.zzz.c')).toBe(true);
  });

  it('a `*` does NOT span multiple segments', () => {
    // Segment-wise, not glob-wise — the distinction that keeps a subscriber on
    // `users.*.name` from hearing `users.1.address.name`.
    expect(matchPath('a.*.c', 'a.x.y.c')).toBe(false);
  });

  it('different segment counts never match', () => {
    expect(matchPath('a.b', 'a.b.c')).toBe(false);
    expect(matchPath('a.b.c', 'a.b')).toBe(false);
  });

  it('a bare `*` matches a single segment only', () => {
    expect(matchPath('*', 'a')).toBe(true);
    expect(matchPath('*', 'a.b')).toBe(false);
  });
});

describe('isGlobKey', () => {
  it('is true for a whole-segment wildcard', () => {
    expect(isGlobKey('phones.*.value')).toBe(true);
    expect(isGlobKey('*')).toBe(true);
  });

  it('is FALSE for a star inside a segment', () => {
    // `weird*name` is a literal field name, and matchPath treats it as one.
    // A substring test would disagree with matchPath, which is the bug this
    // pins against.
    expect(isGlobKey('weird*name')).toBe(false);
  });

  it('is false for an ordinary path', () => {
    expect(isGlobKey('a.b.c')).toBe(false);
  });
});

describe('getChanges', () => {
  it('reports only the keys that differ', () => {
    expect(getChanges({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
  });

  it('is empty when nothing changed', () => {
    expect(getChanges({ a: 1 }, { a: 1 })).toEqual({});
  });

  it('reports a key that was added', () => {
    expect(getChanges({ a: 1 }, { a: 1, b: 2 } as never)).toEqual({ b: 2 });
  });

  it('reports a value changing to undefined', () => {
    expect(getChanges({ a: 1 }, { a: undefined } as never)).toEqual({
      a: undefined,
    });
  });
});

describe('mergeDeep', () => {
  it('merges nested objects rather than replacing them', () => {
    const merged = mergeDeep(
      { user: { name: 'a', age: 1 } },
      { user: { name: 'b' } } as never
    );
    expect(merged).toEqual({ user: { name: 'b', age: 1 } });
  });

  it('leaves untouched keys alone', () => {
    const merged = mergeDeep({ a: 1, b: 2 }, { a: 9 } as never);
    expect(merged.b).toBe(2);
  });

  it('REPLACES arrays rather than merging them elementwise', () => {
    // The behaviour every deep-merge has to choose, and the one callers most
    // often assume the other way round.
    const merged = mergeDeep({ list: [1, 2, 3] }, { list: [9] } as never);
    expect(merged.list).toEqual([9]);
  });

  it('adds a key that was not present', () => {
    expect(mergeDeep({ a: 1 }, { b: 2 } as never)).toEqual({ a: 1, b: 2 });
  });

  it('an empty source changes nothing', () => {
    expect(mergeDeep({ a: 1 }, {} as never)).toEqual({ a: 1 });
  });
});
