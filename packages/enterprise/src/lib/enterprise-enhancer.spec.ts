import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

describe('enterprise enhancer (extended API)', () => {
  it('updateOptimized fires onPathChange listeners with changed paths', () => {
    const tree = signalTree({
      user: { name: 'Alice', age: 30 },
      meta: { version: 1 },
    }).with(enterprise());

    const seen: string[][] = [];
    const off = tree.onPathChange((paths) => seen.push([...paths]));

    tree.updateOptimized({ user: { age: 31 } });

    expect(seen.length).toBe(1);
    expect(seen[0].length).toBeGreaterThan(0);
    off();

    tree.updateOptimized({ user: { age: 32 } });
    expect(seen.length).toBe(1); // unsubscribed
  });

  it('onPathChange does not fire when nothing actually changed', () => {
    const tree = signalTree({ x: 1 }).with(enterprise());
    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));

    tree.updateOptimized({ x: 1 });

    expect(seen.length).toBe(0);
  });

  it('snapshot/restore round-trips state', () => {
    const tree = signalTree({ count: 1, label: 'a' }).with(enterprise());

    const snap = tree.snapshot();
    tree.updateOptimized({ count: 99, label: 'z' });
    expect((tree as unknown as () => { count: number }).call(tree).count).toBe(
      99
    );

    const result = tree.restore(snap);

    expect(result.changed).toBe(true);
    const after = (tree as unknown as () => { count: number; label: string })();
    expect(after.count).toBe(1);
    expect(after.label).toBe('a');
  });

  it('restore notifies onPathChange listeners', () => {
    const tree = signalTree({ count: 1 }).with(enterprise());
    const snap = tree.snapshot();
    tree.updateOptimized({ count: 2 });

    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));
    tree.restore(snap);

    expect(seen.length).toBe(1);
    expect(seen[0].some((p) => p.includes('count'))).toBe(true);
  });

  it('autoOptimizeThreshold routes large updates through diff engine', () => {
    const initial: Record<string, number> = {};
    for (let i = 0; i < 10; i++) initial[`k${i}`] = i;

    const tree = signalTree(initial).with(
      enterprise({ autoOptimizeThreshold: 5 })
    );

    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));

    // 6 keys >= threshold of 5 -> goes through diff engine -> fires listeners
    tree.updateAuto({ k0: 100, k1: 101, k2: 102, k3: 103, k4: 104, k5: 105 });

    expect(seen.length).toBe(1);
    expect(seen[0].length).toBeGreaterThan(0);
  });

  it('autoOptimizeThreshold leaves small updates on the fast path', () => {
    const tree = signalTree({ a: 1, b: 2, c: 3 }).with(
      enterprise({ autoOptimizeThreshold: 5 })
    );

    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));

    // 1 key < threshold -> bypasses diff engine -> no path-change events
    tree.updateAuto({ a: 99 });

    expect(seen.length).toBe(0);
  });
});
