import { computed, Signal } from '@angular/core';
import { deepEqual, LRUCache } from '@signaltree/shared';

import { isNodeAccessor } from '../../lib/utils';

import type { TreeNode } from '../../lib/utils';

import type { ISignalTree } from '../../lib/types';

// Dev environment detection
declare const __DEV__: boolean | undefined;

function isDevMode(): boolean {
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  return false;
}

// Cache entry interface with proper timestamp tracking
interface CacheEntry<T> {
  value: T;
  deps: readonly unknown[];
  timestamp: number;
  hitCount: number;
}

// Global memoization cache with size limits and TTL
const MAX_CACHE_SIZE = 1000;
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

type MemoCacheStore<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
  delete: (key: string) => void;
  clear: () => void;
  size: () => number;
  forEach: (callback: (value: V, key: string) => void) => void;
  keys: () => IterableIterator<string>;
};

// Use Map for global cache management (we keep iteration for diagnostics).
// Note: we avoid starting any global timers at module import to prevent
// background timer leaks in long-running processes; cleanup is performed
// opportunistically inside hot paths (probabilistic) or via explicit APIs.
const memoizationCache = new Map<object, MemoCacheStore<CacheEntry<unknown>>>();

function createMemoCacheStore<V>(
  maxSize: number,
  enableLRU: boolean
): MemoCacheStore<V> {
  if (enableLRU) {
    const cache = new LRUCache<string, V>(maxSize);
    const shadow = new Map<string, V>();

    const pruneShadow = () => {
      while (shadow.size > cache.size()) {
        const oldestKey = shadow.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        shadow.delete(oldestKey);
      }
    };

    return {
      get: (key) => {
        const value = cache.get(key);
        if (value !== undefined) {
          shadow.set(key, value);
        } else if (shadow.has(key)) {
          shadow.delete(key);
        }
        return value;
      },
      set: (key, value) => {
        cache.set(key, value);
        shadow.set(key, value);
        pruneShadow();
      },
      delete: (key) => {
        cache.delete(key);
        shadow.delete(key);
      },
      clear: () => {
        cache.clear();
        shadow.clear();
      },
      size: () => shadow.size,
      forEach: (callback) => {
        shadow.forEach((value, key) => callback(value, key));
      },
      keys: () => shadow.keys(),
    // Primary `memoization` export: wrapper around internal implementation
    export const memoization = Object.assign(
      (config: MemoizationConfig = {}) => _memoizationImpl(config),
      {
        selector: withSelectorMemoization,
        computed: withComputedMemoization,
        deep: withDeepStateMemoization,
        fast: withHighFrequencyMemoization,
      }
    );

    /**
     * @deprecated Use `memoization()` as the primary enhancer. This legacy
     * `withMemoization` alias will be removed in a future major release.
     */
    export const withMemoization = Object.assign(memoization, {});
   * Thorough configuration for complex nested state
   * - Deep equality checks (~50-200μs) for nested objects
   * - Large cache (1000 entries) for complex scenarios
   * - LRU enabled for intelligent cache management
   * - 5-minute TTL to prevent stale data
   * - Best for: Complex nested objects, thorough comparisons needed
   */
  deepState: {
    equality: 'deep' as const,
    maxCacheSize: 1000,
    enableLRU: true,
    ttl: 5 * 60 * 1000,
  },

  /**
   * Minimal overhead for high-frequency operations
   * - Reference-only equality (fastest possible)
   * - Tiny cache (5 entries) for minimal memory
   * - No bells and whistles
   * - Best for: Hot paths, microseconds matter, immutable data
   */
  highFrequency: {
    equality: 'reference' as const,
    maxCacheSize: 5,
    enableLRU: false,
    ttl: undefined,
  },
} as const;

/**
 * Convenience function: Memoization optimized for selectors
 * Uses reference equality and small cache for maximum performance
 *
 * @example
 * ```typescript
 * const tree = signalTree(state).with(withSelectorMemoization());
 * const activeUsers = computed(() =>
 *   tree.state.users().filter(u => u.active)
 * );
 * ```
 */
export function withSelectorMemoization(): <S>(
  tree: ISignalTree<S>
) => ISignalTree<S> & MemoizationMethods<S> {
  return withMemoization(MEMOIZATION_PRESETS.selector);
}

/**
 * Convenience function: Memoization optimized for computed values
 * Uses shallow equality for balanced performance
 *
 * @example
 * ```typescript
 * const tree = signalTree(state).with(withComputedMemoization());
 * const metrics = computed(() =>
 *   calculateExpensiveMetrics(tree.state.data())
 * );
 * ```
 */
export function withComputedMemoization(): <S>(
  tree: ISignalTree<S>
) => ISignalTree<S> & MemoizationMethods<S> {
  return memoization(MEMOIZATION_PRESETS.computed) as unknown as <S>(
    tree: ISignalTree<S>
  ) => ISignalTree<S> & MemoizationMethods<S>;
}

/**
 * Convenience function: Memoization for complex nested state
 * Uses deep equality and LRU management
 *
 * @example
 * ```typescript
 * const tree = signalTree(state).with(withDeepStateMemoization());
 * // Handles complex nested object comparisons
 * ```
 */
export function withDeepStateMemoization(): <S>(
  tree: ISignalTree<S>
) => ISignalTree<S> & MemoizationMethods<S> {
  return memoization(MEMOIZATION_PRESETS.deepState) as unknown as <S>(
    tree: ISignalTree<S>
  ) => ISignalTree<S> & MemoizationMethods<S>;
}

/**
 * Convenience function: Minimal memoization for hot paths
 * Maximum performance with minimal overhead
 *
 * @example
 * ```typescript
 * const tree = signalTree(state).with(withHighFrequencyMemoization());
 * // For operations called thousands of times per second
 * ```
 */
export function withHighFrequencyMemoization(): <S>(
  tree: ISignalTree<S>
) => ISignalTree<S> & MemoizationMethods<S> {
  return memoization(MEMOIZATION_PRESETS.highFrequency) as unknown as <S>(
    tree: ISignalTree<S>
  ) => ISignalTree<S> & MemoizationMethods<S>;
}

// New v6-friendly export: `memoization` with named presets.
/**
 * Core implementation moved to an internal helper so `memoization` can be
 * the primary export while `withMemoization` remains a deprecated alias.
 */
function _memoizationImpl(
  config: MemoizationConfig = {}
): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  // Reuse the implementation that used to live on `withMemoization`
  const {
    enabled = true,
    maxCacheSize = 1000,
    ttl,
    equality = 'deep',
    enableLRU = true,
  } = config;

  const enhancer = <S>(
    tree: ISignalTree<S>
  ): ISignalTree<S> & MemoizationMethods<S> => {
    const originalTreeCall = tree.bind(tree);

    const applyUpdateResult = (result: Partial<S>) => {
      Object.entries(result).forEach(([propKey, value]) => {
        const property = (tree.state as unknown as TreeNode<S>)[
          propKey as keyof S
        ];
        if (property && 'set' in (property as object)) {
          (property as { set: (value: unknown) => void }).set(value);
        } else if (isNodeAccessor(property)) {
          (property as (value: unknown) => void)(value);
        }
      });
    };

    if (!enabled) {
      const memoTree = tree as ISignalTree<S> & MemoizationMethods<S>;

      memoTree.memoize = <R>(
        fn: (state: S) => R,
        _cacheKey?: string
      ): Signal<R> => {
        return computed(() => fn(originalTreeCall()));
      };

      memoTree.memoizedUpdate = (updater) => {
        const currentState = originalTreeCall();
        const result = updater(currentState);
        applyUpdateResult(result);
      };

      memoTree.clearMemoCache = () => {
        /* no-op when memoization disabled */
      };

      (
        memoTree as unknown as { clearCache: typeof memoTree.clearMemoCache }
      ).clearCache = memoTree.clearMemoCache;

      memoTree.getCacheStats = () => ({
        size: 0,
        hitRate: 0,
        totalHits: 0,
        totalMisses: 0,
        keys: [],
      });

      return memoTree;
    }

    // The rest of the implementation is unchanged and reuses existing helpers
    const cache = createMemoCacheStore<CacheEntry<Partial<S>>>(
      maxCacheSize,
      enableLRU
    );
    memoizationCache.set(
      tree as object,
      cache as unknown as MemoCacheStore<CacheEntry<unknown>>
    );

    const equalityFn = getEqualityFn(equality);

    (tree as ISignalTree<S> & MemoizationMethods<S>).memoizedUpdate = (
      updater: (current: S) => Partial<S>,
      cacheKey?: string
    ) => {
      const currentState = originalTreeCall();
      const key =
        cacheKey ||
        generateCacheKey(updater as (...args: unknown[]) => unknown, [
          currentState,
        ]);

      const cached = cache.get(key);
      if (cached && equalityFn(cached.deps, [currentState])) {
        const cachedUpdate = cached.value as Partial<S>;
        applyUpdateResult(cachedUpdate);
        return;
      }

      const result = updater(currentState);

      cache.set(key, {
        value: result,
        deps: [currentState],
        timestamp: Date.now(),
        hitCount: 1,
      });

      applyUpdateResult(result);
    };

    const memoizeResultCache = createMemoCacheStore<CacheEntry<unknown>>(
      MAX_CACHE_SIZE,
      true
    );

    (tree as ISignalTree<S> & MemoizationMethods<S>).memoize = <R>(
      fn: (state: S) => R,
      cacheKey?: string
    ): Signal<R> => {
      return computed(() => {
        const currentState = originalTreeCall();
        const key =
          cacheKey ||
          generateCacheKey(fn as (...args: unknown[]) => unknown, [
            currentState,
          ]);

        const cached = memoizeResultCache.get(key) as
          | CacheEntry<unknown>
          | undefined;
        if (cached && equalityFn(cached.deps, [currentState])) {
          if (isDevMode() && (tree as any).__devHooks?.onRecompute) {
            try {
              (tree as any).__devHooks.onRecompute(key, 1);
            } catch {}
          }
          return cached.value as R;
        }

        const result = fn(currentState);

        memoizeResultCache.set(key, {
          value: result,
          deps: [currentState],
          timestamp: Date.now(),
          hitCount: 1,
        });

        return result;
      });
    };

    (tree as ISignalTree<S> & MemoizationMethods<S>).clearMemoCache = (
      key?: string
    ) => {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    };

    (tree as any).clearCache = (tree as any).clearMemoCache;

    (tree as ISignalTree<S> & MemoizationMethods<S>).getCacheStats = () => {
      let totalHits = 0;
      let totalMisses = 0;

      cache.forEach((entry) => {
        totalHits += entry.hitCount || 0;
        totalMisses += Math.floor((entry.hitCount || 0) / 2);
      });

      const hitRate =
        totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

      return {
        size: cache.size(),
        hitRate,
        totalHits,
        totalMisses,
        keys: Array.from(cache.keys()),
      };
    };

    const maybeInterval = getCleanupInterval(tree as object);
    if (maybeInterval) {
      const origClear = (
        tree as ISignalTree<S> & MemoizationMethods<S>
      ).clearMemoCache.bind(tree as ISignalTree<S> & MemoizationMethods<S>);
      (tree as ISignalTree<S> & MemoizationMethods<S>).clearMemoCache = (
        key?: string
      ) => {
        origClear(key);
        clearCleanupInterval(tree as object);
      };
    }

    (tree as any).clearCache = (tree as any).clearMemoCache;

    if (ttl) {
      const cleanup = () => {
        const now = Date.now();
        cache.forEach((entry, key) => {
          if (entry.timestamp && now - entry.timestamp > ttl) {
            cache.delete(key);
          }
        });
      };

      const intervalId = setInterval(cleanup, ttl);
      setCleanupInterval(tree as object, intervalId);
    }

    return tree as ISignalTree<S> & MemoizationMethods<S>;
  };

  return enhancer as unknown as <Tree extends ISignalTree<any>>(
    tree: Tree
  ) => Tree & MemoizationMethods<any>;
}

export function memoization(config: MemoizationConfig = {}) {
  return _memoizationImpl(config);
}

// Attach presets on the primary `memoization` export
export const memoization = Object.assign(memoization, {
  selector: withSelectorMemoization,
  computed: withComputedMemoization,
  deep: withDeepStateMemoization,
  fast: withHighFrequencyMemoization,
});

/**
 * Enhances a SignalTree with memoization capabilities
 * Uses unconstrained recursive typing - no limitations on T
 */
/**
 * @deprecated Use `memoization()` instead. This legacy factory will be
 * removed in a future major release.
 */
export function withMemoization(
  config: MemoizationConfig = {}
): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  const {
    enabled = true,
    maxCacheSize = 1000,
    ttl,
    // Default behavior: deep equality and LRU enabled to preserve
    // memoization semantics expected by existing consumers/tests.
    equality = 'deep',
    enableLRU = true,
  } = config;

  const enhancer = <S>(
    tree: ISignalTree<S>
  ): ISignalTree<S> & MemoizationMethods<S> => {
    const originalTreeCall = tree.bind(tree);

    const applyUpdateResult = (result: Partial<S>) => {
      Object.entries(result).forEach(([propKey, value]) => {
        const property = (tree.state as unknown as TreeNode<S>)[
          propKey as keyof S
        ];
        if (property && 'set' in (property as object)) {
          (property as { set: (value: unknown) => void }).set(value);
        } else if (isNodeAccessor(property)) {
          (property as (value: unknown) => void)(value);
        }
      });
    };

    if (!enabled) {
      const memoTree = tree as ISignalTree<S> & MemoizationMethods<S>;

      // No-op memoize when memoization is disabled — wrap in computed
      // to preserve Signal return shape and avoid runtime errors.
      memoTree.memoize = <R>(
        fn: (state: S) => R,
        _cacheKey?: string
      ): Signal<R> => {
        return computed(() => fn(originalTreeCall()));
      };

      memoTree.memoizedUpdate = (updater) => {
        const currentState = originalTreeCall();
        const result = updater(currentState);
        applyUpdateResult(result);
      };

      memoTree.clearMemoCache = () => {
        /* no-op when memoization disabled */
      };

      // Compatibility alias used by some convenience helpers/tests
      (
        memoTree as unknown as { clearCache: typeof memoTree.clearMemoCache }
      ).clearCache = memoTree.clearMemoCache;

      memoTree.getCacheStats = () => ({
        size: 0,
        hitRate: 0,
        totalHits: 0,
        totalMisses: 0,
        keys: [],
      });

      return memoTree;
    }

    // Initialize cache for this tree
    const cache = createMemoCacheStore<CacheEntry<Partial<S>>>(
      maxCacheSize,
      enableLRU
    );
    memoizationCache.set(
      tree as object,
      cache as unknown as MemoCacheStore<CacheEntry<unknown>>
    );

    const equalityFn = getEqualityFn(equality);

    // Add memoized update method
    (tree as ISignalTree<S> & MemoizationMethods<S>).memoizedUpdate = (
      updater: (current: S) => Partial<S>,
      cacheKey?: string
    ) => {
      const currentState = originalTreeCall();

      // Determine cache key: prefer explicit keyFn-like behavior if not provided
      const key =
        cacheKey ||
        generateCacheKey(updater as (...args: unknown[]) => unknown, [
          currentState,
        ]);

      // Check cache
      const cached = cache.get(key);
      if (cached && equalityFn(cached.deps, [currentState])) {
        // Apply cached result - use callable interface to set the partial update
        const cachedUpdate = cached.value as Partial<S>;
        applyUpdateResult(cachedUpdate);
        return;
      }

      // Compute new result
      const result = updater(currentState);

      // Cache the result
      cache.set(key, {
        value: result,
        deps: [currentState],
        timestamp: Date.now(),
        hitCount: 1,
      });

      // Apply update using callable interface
      applyUpdateResult(result);
    };

    // Create a separate cache for tree.memoize() results
    // This is different from the memoizedUpdate cache
    const memoizeResultCache = createMemoCacheStore<CacheEntry<unknown>>(
      MAX_CACHE_SIZE,
      true
    );

    // Override tree.memoize() to provide actual memoization
    // The stub implementation just wraps in computed() without caching
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tree as ISignalTree<S> & MemoizationMethods<S>).memoize = <R>(
      fn: (state: S) => R,
      cacheKey?: string
    ): Signal<R> => {
      return computed(() => {
        const currentState = originalTreeCall();
        const key =
          cacheKey ||
          generateCacheKey(fn as (...args: unknown[]) => unknown, [
            currentState,
          ]);

        // Check cache
        const cached = memoizeResultCache.get(key) as
          | CacheEntry<unknown>
          | undefined;
        if (cached && equalityFn(cached.deps, [currentState])) {
          // Cache hit - return cached result
          return cached.value as R;
        }

        // Cache miss - compute new result
        // Notify dev hooks about recomputation (if enabled)
        if (isDevMode() && (tree as any).__devHooks?.onRecompute) {
          try {
            (tree as any).__devHooks.onRecompute(key, 1);
          } catch {
            // Ignore dev hook errors
          }
        }

        const result = fn(currentState);

        // Cache the result
        memoizeResultCache.set(key, {
          value: result,
          deps: [currentState],
          timestamp: Date.now(),
          hitCount: 1,
        });

        return result;
      });
    };

    // Add cache management methods
    (tree as ISignalTree<S> & MemoizationMethods<S>).clearMemoCache = (
      key?: string
    ) => {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    };

    // Provide compatibility alias
    (tree as any).clearCache = (tree as any).clearMemoCache;

    (tree as ISignalTree<S> & MemoizationMethods<S>).getCacheStats = () => {
      let totalHits = 0;
      let totalMisses = 0;

      cache.forEach((entry) => {
        totalHits += entry.hitCount || 0;
        // For simplicity, we'll estimate misses as half of hits
        totalMisses += Math.floor((entry.hitCount || 0) / 2);
      });

      const hitRate =
        totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

      return {
        size: cache.size(),
        hitRate,
        totalHits,
        totalMisses,
        keys: Array.from(cache.keys()),
      };
    };

    // If we created a periodic cleanup for this tree, ensure callers can clear it
    const maybeInterval = getCleanupInterval(tree as object);
    if (maybeInterval) {
      // When the tree cache is cleared, also clear the interval
      const origClear = (
        tree as ISignalTree<S> & MemoizationMethods<S>
      ).clearMemoCache.bind(tree as ISignalTree<S> & MemoizationMethods<S>);
      (tree as ISignalTree<S> & MemoizationMethods<S>).clearMemoCache = (
        key?: string
      ) => {
        origClear(key);
        clearCleanupInterval(tree as object);
      };
    }

    // Ensure alias reflects any wrapped/overridden clear implementation
    (tree as any).clearCache = (tree as any).clearMemoCache;

    // Intentionally do NOT attach memoization helpers to `tree.$` to preserve
    // the "callable-only nodes" invariant for serialization safety.

    // Clean up expired entries if TTL is set
    if (ttl) {
      const cleanup = () => {
        const now = Date.now();
        cache.forEach((entry, key) => {
          if (entry.timestamp && now - entry.timestamp > ttl) {
            cache.delete(key);
          }
        });
      };

      // Run cleanup periodically
      const intervalId = setInterval(cleanup, ttl);

      // Store interval ID for cleanup (handle Node.js vs browser differences)
      setCleanupInterval(tree as object, intervalId);
    }

    return tree as ISignalTree<S> & MemoizationMethods<S>;
  };

  return enhancer as unknown as <Tree extends ISignalTree<any>>(
    tree: Tree
  ) => Tree & MemoizationMethods<any>;
}

/**
 * Convenience function to enable memoization with default settings
 * Uses unconstrained recursive typing - no limitations on T
 */
export function enableMemoization(): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  return withMemoization({ enabled: true });
}

/**
 * High-performance memoization with aggressive caching
 * Uses unconstrained recursive typing - no limitations on T
 */
export function withHighPerformanceMemoization(): <
  Tree extends ISignalTree<any>
>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 10000,
    ttl: 300000, // 5 minutes
    equality: 'shallow', // Faster than deep equality
    enableLRU: true,
  });
}

/**
 * Lightweight memoization optimized for performance-critical scenarios
 * Disables expensive cache management features for maximum speed
 */
export function withLightweightMemoization(): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 100, // Smaller cache to reduce management overhead
    ttl: undefined, // No TTL to avoid timestamp checks
    equality: 'reference', // Fastest equality check
    enableLRU: false, // No LRU to avoid hit count tracking
  });
}

/**
 * Shallow equality memoization for objects with primitive values
 * Good balance between performance and correctness
 */
export function withShallowMemoization(): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 1000,
    ttl: 60000, // 1 minute
    equality: 'shallow',
    enableLRU: true,
  });
}

/**
 * Clear all memoization caches
 */
export function clearAllCaches(): void {
  resetMemoizationCaches();
}

/**
 * Get global cache statistics
 */
export function getGlobalCacheStats(): {
  treeCount: number;
  totalSize: number;
  totalHits: number;
  averageCacheSize: number;
} {
  // Note: We keep a Map keyed by tree objects to allow listing and diagnostics
  // (WeakMap would prevent traversal). This function summarizes those diagnostics.
  let totalSize = 0;
  let totalHits = 0;
  let treeCount = 0;

  memoizationCache.forEach((cache) => {
    treeCount++;
    totalSize += cache.size();

    cache.forEach((entry) => {
      totalHits += entry.hitCount || 0;
    });
  });

  return {
    treeCount,
    totalSize,
    totalHits,
    averageCacheSize: treeCount > 0 ? totalSize / treeCount : 0,
  };
}
