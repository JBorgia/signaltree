import { describe, expect, it, vi } from 'vitest';

import { signalTree } from './signal-tree';

describe('updateAndReport + ref-equality short-circuit', () => {
  it('returns dot-paths of leaf signals that actually changed', () => {
    const tree = signalTree({
      user: { name: 'Alice', age: 30 },
      meta: { version: 1 },
    });

    const changed = tree.updateAndReport({
      user: { age: 31 },
      meta: { version: 1 }, // unchanged — must NOT appear
    });

    expect(changed).toContain('user.age');
    expect(changed).not.toContain('user.name');
    expect(changed).not.toContain('meta.version');
  });

  it('returns an empty array when nothing changed', () => {
    const tree = signalTree({ a: 1, b: 'x' });

    const changed = tree.updateAndReport({ a: 1, b: 'x' });

    expect(changed).toEqual([]);
  });

  it('skips signal.set() when incoming value is ref-equal', () => {
    const tree = signalTree({ count: 0 });
    const sig = tree.$.count as unknown as {
      set: (v: unknown) => void;
    };
    const setSpy = vi.spyOn(sig, 'set');

    // Same value: should be skipped
    tree({ count: 0 });
    expect(setSpy).not.toHaveBeenCalled();

    // Different value: should fire
    tree({ count: 1 });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('updateAndReport accepts an updater function', () => {
    const tree = signalTree({ count: 1, label: 'a' });

    const changed = tree.updateAndReport((current) => ({
      count: current.count + 1,
      label: current.label, // unchanged
    }));

    expect(changed).toContain('count');
    expect(changed).not.toContain('label');
  });
});
