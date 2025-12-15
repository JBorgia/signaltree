import { computed, Signal } from '@angular/core';
import { deepEqual, LRUCache } from '@signaltree/shared';

import { isNodeAccessor } from '../../../lib/utils';

import type { SignalTree } from '../../../lib/types';
/**
 * Extended SignalTree interface with memoization capabilities
 * Uses the same unconstrained recursive typing approach as core
 */
export interface MemoizedSignalTree<T> extends SignalTree<T> {
  memoizedUpdate: (
    updater: (current: T) => Partial<T>,
    cacheKey?: string
  ) => void;
  clearMemoCache: (key?: string) => void;
  getCacheStats: () => {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    keys: string[];
  };
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
    };
  }

  const store = new Map<string, V>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
    size: () => store.size,
    forEach: (callback) => {
      store.forEach((value, key) => callback(value, key));
    },
    keys: () => store.keys(),
  };
}

function getCleanupInterval(
  tree: object
): ReturnType<typeof setInterval> | undefined {
  return (
    tree as {
      _memoCleanupInterval?: ReturnType<typeof setInterval>;
    }
  )._memoCleanupInterval;
}

function setCleanupInterval(
  tree: object,
  interval?: ReturnType<typeof setInterval>
): void {
  if (interval === undefined) {
    delete (
      tree as {
        _memoCleanupInterval?: ReturnType<typeof setInterval>;
      }
    )._memoCleanupInterval;
    return;
  }

  (
    tree as {
      _memoCleanupInterval?: ReturnType<typeof setInterval>;
    }
  )._memoCleanupInterval = interval;
}

function clearCleanupInterval(tree: object): void {
  const interval = getCleanupInterval(tree);
  if (!interval) {
    return;
  }

  try {
    clearInterval(interval as unknown as number);
  } catch {
    /* best-effort cleanup */
  }

  setCleanupInterval(tree);
}

function resetMemoizationCaches(): void {
  memoizationCache.forEach((cache, tree) => {
    cache.clear();
    clearCleanupInterval(tree);
  });
  memoizationCache.clear();
}

/**
 * Cleanup the cache interval on app shutdown
 */
export function cleanupMemoizationCache(): void {
  resetMemoizationCaches();
}

/**
 * Memoization configuration options
 */
export interface MemoizationConfig {
  enabled?: boolean;
  maxCacheSize?: number;
  ttl?: number; // Time to live in milliseconds
  equality?: 'deep' | 'shallow' | 'reference'; // Equality comparison strategy
  enableLRU?: boolean; // Enable LRU eviction (has overhead)
}

/**
 * Shallow equality check for dependency comparison
 * Much faster than deep equality for objects with primitive values
 * Optimized: Uses for...in instead of Object.keys() to avoid array allocations
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    // Count properties in objA and check equality
    let countA = 0;
    for (const key in objA) {
      if (!Object.prototype.hasOwnProperty.call(objA, key)) continue;
      countA++;
      // Early exit if key missing or value different
      if (!(key in objB) || objA[key] !== objB[key]) return false;
    }

    // Count properties in objB to ensure same number
    let countB = 0;
    for (const key in objB) {
      if (Object.prototype.hasOwnProperty.call(objB, key)) countB++;
    }

    return countA === countB;
  }

  return false;
}
/**
 * Generate cache key for memoization
 */
function generateCacheKey(
  fn: (...args: unknown[]) => unknown,
  args: unknown[]
): string {
  try {
    return `${fn.name || 'anonymous'}_${JSON.stringify(args)}`;
  } catch {
    // Fallback for cyclic or non-serializable args
    return `${fn.name || 'anonymous'}_${args.length}`;
  }
}

/**
 * Get equality function based on strategy
 */
function getEqualityFn(
  strategy: 'deep' | 'shallow' | 'reference'
): (a: unknown, b: unknown) => boolean {
  switch (strategy) {
    case 'shallow':
      return shallowEqual;
    case 'reference':
      return (a, b) => a === b;
    case 'deep':
    default:
      return deepEqual;
  }
}

/**
 * Memoization function that caches expensive computations with enhanced cache management
 */
export function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string,
  config: MemoizationConfig = {}
): (...args: TArgs) => TReturn {
  const maxSize = config.maxCacheSize ?? MAX_CACHE_SIZE;
  const ttl = config.ttl ?? DEFAULT_TTL;
  // Use shallow equality by default to avoid expensive deep comparisons
  const equality = getEqualityFn(config.equality ?? 'shallow');
  // Disable LRU by default to avoid hidden CPU overhead
  const enableLRU = config.enableLRU ?? false;
  const cache = createMemoCacheStore<CacheEntry<TReturn>>(maxSize, enableLRU);

  const cleanExpiredEntries = () => {
    if (!ttl) return; // Skip if TTL is disabled
    const now = Date.now();
    cache.forEach((entry, key) => {
      if (entry.timestamp && now - entry.timestamp > ttl) {
        cache.delete(key);
      }
    });
  };

  return (...args: TArgs): TReturn => {
    // Probabilistic cleanup to avoid paying cleanup cost on every hot call.
    // Runs ~1% of the time when TTL is enabled.
    if (ttl && Math.random() < 0.01) {
      cleanExpiredEntries();
    }

    const key = keyFn
      ? keyFn(...args)
      : generateCacheKey(
          fn as (...args: unknown[]) => unknown,
          args as unknown[]
        );
    const cached = cache.get(key);

    // If using custom key function, trust the key; otherwise check equality
    if (cached && (keyFn || equality(cached.deps, args))) {
      if (enableLRU) {
        cached.hitCount += 1;
      }
      return cached.value;
    }

    const result = fn(...args);
    cache.set(key, {
      value: result,
      deps: args as readonly unknown[],
      timestamp: Date.now(),
      hitCount: 1,
    });

    return result;
  };
}
/**
 * High-performance memoization function optimized for speed
 * Uses shallow equality and minimal cache management overhead
 */
export function memoizeShallow<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  return memoize(fn, keyFn, {
    equality: 'shallow',
    enableLRU: false,
    ttl: undefined,
    maxCacheSize: 100,
  });
}

/**
 * Lightweight memoization function with reference equality only
 * Maximum performance for scenarios where exact reference matches are sufficient
 */
export function memoizeReference<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  return memoize(fn, keyFn, {
    equality: 'reference',
    enableLRU: false,
    ttl: undefined,
    maxCacheSize: 50,
  });
}

/**
 * Preset memoization configurations optimized for common use cases
 * These presets are the same ones used in SignalTree's benchmarks
 */
export const MEMOIZATION_PRESETS = {
  /**
   * Optimized for selectors and frequently-accessed computed values
   * - Fast reference-only equality checks (~0.3μs)
   * - Small cache (10 entries) for minimal overhead
   * - No LRU management (eliminates bookkeeping cost)
   * - Best for: Selectors, derived values, stable references
   */
  selector: {
    equality: 'reference' as const,
    maxCacheSize: 10,
    enableLRU: false,
    ttl: undefined,
  },

  /**
   * Balanced configuration for general computed values
   * - Shallow equality checks (~5-15μs) for object comparisons
   * - Medium cache (100 entries) for reasonable coverage
   * - No LRU (good performance/memory balance)
   * - Best for: General computations, objects with primitives
   */
  computed: {
    equality: 'shallow' as const,
    maxCacheSize: 100,
    enableLRU: false,
    ttl: undefined,
  },

  /**
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
export function withSelectorMemoization<T>() {
  return withMemoization<T>(MEMOIZATION_PRESETS.selector);
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
export function withComputedMemoization<T>() {
  return withMemoization<T>(MEMOIZATION_PRESETS.computed);
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
export function withDeepStateMemoization<T>() {
  return withMemoization<T>(MEMOIZATION_PRESETS.deepState);
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
export function withHighFrequencyMemoization<T>() {
  return withMemoization<T>(MEMOIZATION_PRESETS.highFrequency);
}

/**
 * Enhances a SignalTree with memoization capabilities
 * Uses unconstrained recursive typing - no limitations on T
 */
export function withMemoization<T>(
  config: MemoizationConfig = {}
): (tree: SignalTree<T>) => MemoizedSignalTree<T> {
  const {
    enabled = true,
    maxCacheSize = 1000,
    ttl,
    // Default behavior: deep equality and LRU enabled to preserve
    // memoization semantics expected by existing consumers/tests.
    equality = 'deep',
    enableLRU = true,
  } = config;

  return (tree: SignalTree<T>): MemoizedSignalTree<T> => {
    const originalTreeCall = tree.bind(tree);

    const applyUpdateResult = (result: Partial<T>) => {
      Object.entries(result).forEach(([propKey, value]) => {
        const property = (tree.state as Record<string, unknown>)[propKey];
        if (property && 'set' in (property as object)) {
          (property as { set: (value: unknown) => void }).set(value);
        } else if (isNodeAccessor(property)) {
          (property as (value: unknown) => void)(value);
        }
      });
    };

    if (!enabled) {
      const memoTree = tree as MemoizedSignalTree<T>;

      memoTree.memoizedUpdate = (updater) => {
        const currentState = originalTreeCall();
        const result = updater(currentState);
        applyUpdateResult(result);
      };

      memoTree.clearMemoCache = () => {
        /* no-op when memoization disabled */
      };

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
    const cache = createMemoCacheStore<CacheEntry<Partial<T>>>(
      maxCacheSize,
      enableLRU
    );
    memoizationCache.set(
      tree as object,
      cache as unknown as MemoCacheStore<CacheEntry<unknown>>
    );

    const equalityFn = getEqualityFn(equality);

    // Add memoized update method
    (tree as MemoizedSignalTree<T>).memoizedUpdate = (
      updater: (current: T) => Partial<T>,
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
        const cachedUpdate = cached.value as Partial<T>;
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
    (tree as any).memoize = <R>(
      fn: (state: T) => R,
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
    (tree as MemoizedSignalTree<T>).clearMemoCache = (key?: string) => {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    };

    (tree as MemoizedSignalTree<T>).getCacheStats = () => {
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
      const origClear = (tree as MemoizedSignalTree<T>).clearMemoCache.bind(
        tree as MemoizedSignalTree<T>
      );
      (tree as MemoizedSignalTree<T>).clearMemoCache = (key?: string) => {
        origClear(key);
        clearCleanupInterval(tree as object);
      };
    }

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

    return tree as MemoizedSignalTree<T>;
  };
}

/**
 * Convenience function to enable memoization with default settings
 * Uses unconstrained recursive typing - no limitations on T
 */
export function enableMemoization<T>() {
  return withMemoization<T>({ enabled: true });
}

/**
 * High-performance memoization with aggressive caching
 * Uses unconstrained recursive typing - no limitations on T
 */
export function withHighPerformanceMemoization<T>() {
  return withMemoization<T>({
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
export function withLightweightMemoization<T>() {
  return withMemoization<T>({
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
export function withShallowMemoization<T>() {
  return withMemoization<T>({
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
