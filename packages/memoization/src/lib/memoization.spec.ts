import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import {
  withMemoization,
  enableMemoization,
  withHighPerformanceMemoization,
  memoize,
  clearAllCaches,
  getGlobalCacheStats,
} from './memoization';

describe('Memoization', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    clearAllCaches();
  });

  it('should enhance tree with memoization capabilities', () => {
    const tree = signalTree({ count: 0 }).pipe(withMemoization());

    expect(tree.memoizedUpdate).toBeDefined();
    expect(tree.clearMemoCache).toBeDefined();
    expect(tree.getCacheStats).toBeDefined();
  });

  it('should cache memoized updates', () => {
    const tree = signalTree({ count: 0, computed: 0 }).pipe(withMemoization());

    // Track expensive computation calls
    let computationCalls = 0;
    const expensiveComputation = (count: number) => {
      computationCalls++;
      return count * 2;
    };

    // First memoized update
    tree.memoizedUpdate(
      (state) => ({
        computed: expensiveComputation(state.count),
      }),
      'computation1'
    );

    expect(tree.state.computed()).toBe(0);
    expect(computationCalls).toBe(1);

    // Same memoized update should use cache
    tree.memoizedUpdate(
      (state) => ({
        computed: expensiveComputation(state.count),
      }),
      'computation1'
    );

    expect(tree.state.computed()).toBe(0);
    expect(computationCalls).toBe(1); // Should not increase

    // Different cache key should trigger new computation
    tree.memoizedUpdate(
      (state) => ({
        computed: expensiveComputation(state.count),
      }),
      'computation2'
    );

    expect(computationCalls).toBe(2);
  });

  it('should provide cache statistics', () => {
    const tree = signalTree({ count: 0 }).pipe(withMemoization());

    tree.memoizedUpdate(() => ({ count: 1 }), 'update1');
    tree.memoizedUpdate(() => ({ count: 2 }), 'update2');

    const stats = tree.getCacheStats?.();
    expect(stats?.size).toBe(2);
    expect(stats?.keys).toContain('update1');
    expect(stats?.keys).toContain('update2');
    expect(stats?.totalHits).toBe(2);
  });

  it('should clear cache correctly', () => {
    const tree = signalTree({ count: 0 }).pipe(withMemoization());

    tree.memoizedUpdate(() => ({ count: 1 }), 'update1');
    tree.memoizedUpdate(() => ({ count: 2 }), 'update2');

    expect(tree.getCacheStats?.()?.size).toBe(2);

    // Clear specific key
    tree.clearMemoCache?.('update1');
    expect(tree.getCacheStats?.()?.size).toBe(1);
    expect(tree.getCacheStats?.()?.keys).not.toContain('update1');

    // Clear all
    tree.clearMemoCache?.();
    expect(tree.getCacheStats?.()?.size).toBe(0);
  });

  it('should work with enableMemoization convenience function', () => {
    const tree = signalTree({ count: 0 }).pipe(enableMemoization());

    expect(tree.memoizedUpdate).toBeDefined();
    expect(tree.clearCache).toBeDefined();
    expect(tree.getCacheStats).toBeDefined();
  });

  it('should work with high performance memoization', () => {
    const tree = signalTree({ count: 0 }).pipe(
      withHighPerformanceMemoization()
    );

    expect(tree.memoizedUpdate).toBeDefined();

    // Should handle large number of cached entries
    for (let i = 0; i < 100; i++) {
      tree.memoizedUpdate(() => ({ count: i }), `update${i}`);
    }

    const stats = tree.getCacheStats?.();
    expect(stats?.size).toBe(100);
  });

  it('should disable memoization when enabled is false', () => {
    const tree = signalTree({ count: 0 }).pipe(
      withMemoization({ enabled: false })
    );

    // Should not have memoization methods
    expect(tree.memoizedUpdate).toBeUndefined();
    expect(tree.clearMemoCache).toBeUndefined();
    expect(tree.getCacheStats).toBeUndefined();
  });

  it('should enforce cache size limits', () => {
    const tree = signalTree({ count: 0 }).pipe(
      withMemoization({ maxCacheSize: 3 })
    );

    // Add more entries than the limit
    tree.memoizedUpdate(() => ({ count: 1 }), 'update1');
    tree.memoizedUpdate(() => ({ count: 2 }), 'update2');
    tree.memoizedUpdate(() => ({ count: 3 }), 'update3');
    tree.memoizedUpdate(() => ({ count: 4 }), 'update4');
    tree.memoizedUpdate(() => ({ count: 5 }), 'update5');

    // Cache should be limited
    const stats = tree.getCacheStats?.();
    expect(stats?.size).toBeLessThanOrEqual(3);
  });

  describe('memoize function', () => {
    it('should memoize function calls', () => {
      let callCount = 0;
      const expensiveFunction = (x: number, y: number) => {
        callCount++;
        return x + y;
      };

      const memoized = memoize(expensiveFunction);

      // First call
      expect(memoized(1, 2)).toBe(3);
      expect(callCount).toBe(1);

      // Same arguments should use cache
      expect(memoized(1, 2)).toBe(3);
      expect(callCount).toBe(1);

      // Different arguments should trigger new call
      expect(memoized(2, 3)).toBe(5);
      expect(callCount).toBe(2);
    });

    it('should work with custom key function', () => {
      let callCount = 0;
      const fn = (obj: { id: number; name: string }) => {
        callCount++;
        return `${obj.id}-${obj.name}`;
      };

      const memoized = memoize(fn, (obj) => obj.id.toString());

      const obj1 = { id: 1, name: 'John' };
      const obj2 = { id: 1, name: 'Jane' }; // Same ID, different name

      expect(memoized(obj1)).toBe('1-John');
      expect(callCount).toBe(1);

      // Should use cache because same ID
      expect(memoized(obj2)).toBe('1-John');
      expect(callCount).toBe(1);
    });
  });

  describe('Global cache management', () => {
    describe('Global cache management', () => {
      it('should provide global cache statistics', () => {
        // Note: Global cache statistics are limited due to WeakMap usage
        // This test validates the API exists but may return placeholder values
        const globalStats = getGlobalCacheStats();
        expect(typeof globalStats.treeCount).toBe('number');
        expect(typeof globalStats.totalSize).toBe('number');
        expect(typeof globalStats.totalHits).toBe('number');
        expect(typeof globalStats.averageCacheSize).toBe('number');
      });

      it('should clear all caches', () => {
        const tree1 = signalTree({ count: 0 }).pipe(withMemoization());
        const tree2 = signalTree({ value: 'test' }).pipe(withMemoization());

        tree1.memoizedUpdate?.(() => ({ count: 1 }), 'update1');
        tree2.memoizedUpdate?.(() => ({ value: 'updated' }), 'update2');

        expect(getGlobalCacheStats().totalSize).toBe(2);

        clearAllCaches();

        expect(getGlobalCacheStats().totalSize).toBe(0);
        expect(tree1.getCacheStats?.()?.size).toBe(0);
        expect(tree2.getCacheStats?.()?.size).toBe(0);
      });
    });

    describe('TTL (Time To Live)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should expire cache entries after TTL', () => {
        const tree = signalTree({ count: 0 }).pipe(
          withMemoization({ ttl: 1000 }) // 1 second TTL
        );

        tree.memoizedUpdate?.(() => ({ count: 1 }), 'update1');
        expect(tree.getCacheStats?.()?.size).toBe(1);

        // Fast forward time to trigger cleanup interval (TTL + enough for cleanup to run)
        jest.advanceTimersByTime(1000); // First interval at 1000ms
        jest.runOnlyPendingTimers(); // Ensure any pending timers execute

        // Cache should be cleaned up after TTL expiration
        expect(tree.getCacheStats?.()?.size).toBe(0);
      });
    });
  });
});
