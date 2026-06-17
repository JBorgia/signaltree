import { describe, expect, it } from 'vitest';

import { applySerialization } from './serialization';
import { signalTree } from '../../lib/signal-tree';

describe('serialization round-trip', () => {
  it('serializes and deserializes complex types (Date, Map, Set)', () => {
    // Real tree exercises the actual serialization path end-to-end. NOTE: the
    // Set field is named `tags` (not `set`) — a state key literally named `set`
    // collides with serialization's `tree.$.set` root-marker probe (a separate,
    // pre-existing serialization quirk, unrelated to this test's intent).
    const initial = {
      count: 1,
      date: new Date('2020-01-02T03:04:05Z'),
      map: new Map([['a', 1]]),
      tags: new Set(['x', 'y']),
      nested: { n: 2 },
    };

    const tree = signalTree(initial) as unknown as any;
    const enhanced = applySerialization(tree) as any;

    const json = enhanced.serialize();
    // Mutate to wrong values, then deserialize must restore the originals.
    tree(() => ({
      count: 999,
      date: new Date(0),
      map: new Map<string, number>(),
      tags: new Set<string>(),
      nested: { n: 0 },
    }));

    enhanced.deserialize(json);

    const restored = tree();
    expect(restored.count).toBe(1);
    expect(restored.date instanceof Date).toBe(true);
    expect(restored.date.toISOString()).toBe(initial.date.toISOString());
    expect(restored.map instanceof Map).toBe(true);
    expect(Array.from(restored.map.entries())).toEqual(
      Array.from(initial.map.entries())
    );
    expect(restored.tags instanceof Set).toBe(true);
    expect(Array.from(restored.tags.values()).sort()).toEqual(
      Array.from(initial.tags.values()).sort()
    );
    expect(restored.nested.n).toBe(2);
  });
});
