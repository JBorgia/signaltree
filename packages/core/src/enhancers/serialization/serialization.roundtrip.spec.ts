import { describe, expect, it } from 'vitest';

import { applySerialization } from './serialization';

function createFakeTree(initial: any) {
  let state = initial;
  const tree: any = function (arg?: any) {
    if (arguments.length === 0) return state;
    if (typeof arg === 'function') state = arg(state);
    else state = arg;
  };

  // Provide root alias with `set` so serialization marks root as 'r'
  tree.$ = {
    set: (v: any) => {
      state = v;
    },
  };

  tree.state = state;

  return tree as unknown as any;
}

describe('serialization round-trip', () => {
  it('serializes and deserializes complex types (Date, Map, Set)', () => {
    const initial = {
      count: 1,
      date: new Date('2020-01-02T03:04:05Z'),
      map: new Map([['a', 1]]),
      set: new Set(['x', 'y']),
      nested: { n: 2 },
    } as any;

    const tree = createFakeTree(initial);
    const enhanced = applySerialization(tree as any) as any;

    const json = enhanced.serialize();
    // clear state
    tree(() => ({}));

    enhanced.deserialize(json);

    const restored = tree();
    expect(restored.count).toBe(1);
    expect(restored.date instanceof Date).toBe(true);
    expect(restored.date.toISOString()).toBe(initial.date.toISOString());
    expect(restored.map instanceof Map).toBe(true);
    expect(Array.from(restored.map.entries())).toEqual(
      Array.from(initial.map.entries())
    );
    expect(restored.set instanceof Set).toBe(true);
    expect(Array.from(restored.set.values()).sort()).toEqual(
      Array.from(initial.set.values()).sort()
    );
    expect(restored.nested.n).toBe(2);
  });
});
