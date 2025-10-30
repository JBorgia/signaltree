import { clearAllCaches, withMemoization } from '../memoization';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal fake SignalTree shape for tests
function makeFakeTree(initial: Record<string, unknown>) {
  // Minimal shape: callable returns backing object, and tree.state has
  // properties with .set() methods used by memoizedUpdate.
  const backing: Record<string, unknown> = { ...initial };
  const stateObj: Record<string, { set: (v: unknown) => void }> =
    Object.fromEntries(
      Object.keys(initial).map((k) => [
        k,
        { set: (v: unknown) => (backing[k] = v) },
      ])
    ) as Record<string, { set: (v: unknown) => void }>;

  const tree: any = () => backing;
  tree.state = stateObj;
  tree.$ = {};
  return tree;
}

describe('memoization integration', () => {
  afterEach(() => {
    clearAllCaches();
  });

  test('memoizedUpdate caches results and getCacheStats reports size', () => {
    const tree = makeFakeTree({ a: 1 });
    const enhance = withMemoization({ ttl: undefined, enableLRU: false });
    const mt = enhance(tree as any);

    // First update should compute and cache — updater receives current state
    mt.memoizedUpdate((state: any) => ({ a: (state.a as number) + 1 }), 'key1');
    const stats1 = mt.getCacheStats();
    expect(stats1.size).toBeGreaterThanOrEqual(1);

    // Second call with same state should hit cache (no state change)
    mt.memoizedUpdate((state: any) => ({ a: (state.a as number) + 1 }), 'key1');
    const stats2 = mt.getCacheStats();
    expect(stats2.totalHits).toBeGreaterThanOrEqual(1);
  });

  test('clearAllCaches removes global entries', () => {
    const tree = makeFakeTree({ x: 1 });
    const enhance = withMemoization({ ttl: undefined });
    const mt = enhance(tree as any);

    mt.memoizedUpdate((state: any) => ({ x: (state.x as number) + 1 }), 'k');
    const stats = mt.getCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(1);

    clearAllCaches();
    const statsAfter = mt.getCacheStats();
    // After clearing global caches, the tree-level cache object may still exist
    // but should be empty
    expect(statsAfter.size).toBe(0);
  });
});
