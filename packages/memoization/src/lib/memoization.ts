import { SignalTree, StateObject } from '@signaltree/core';

/**
 * Extended SignalTree interface with memoization capabilities
 */
interface MemoizedSignalTree<T extends StateObject> extends SignalTree<T> {
  memoizedUpdate: (
    updater: (current: T) => Partial<T>,
    cacheKey?: string
  ) => void;
  clearMemoCache: (key?: string) => void;
  getCacheStats: () => {
    size: number;
    totalHits: number;
    keys: string[];
  };
}

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  deps: readonly unknown[]; // Use readonly to fix the mutable assignment error
  timestamp?: number;
  hitCount?: number;
}

// Memoization cache storage using Map for iteration support
const memoizationCache = new Map<object, Map<string, CacheEntry<unknown>>>();

/**
 * Memoization configuration options
 */
interface MemoizationConfig {
  enabled?: boolean;
  maxCacheSize?: number;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Deep equality check for dependency comparison - keeping flexible for any values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(objA[key], objB[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Generate cache key for memoization - keeping flexible for any function types
 */
function generateCacheKey(
  fn: (...args: unknown[]) => unknown,
  args: unknown[]
): string {
  return `${fn.name || 'anonymous'}_${JSON.stringify(args)}`;
}

/**
 * Memoization function that caches expensive computations
 */
export function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  const cache = new Map<string, CacheEntry<TReturn>>();

  return (...args: TArgs): TReturn => {
    const key = keyFn
      ? keyFn(...args)
      : generateCacheKey(
          fn as (...args: unknown[]) => unknown,
          args as unknown[]
        );
    const cached = cache.get(key);

    // If using custom key function, trust the key; otherwise check deep equality
    if (cached && (keyFn || deepEqual(cached.deps, args))) {
      cached.hitCount = (cached.hitCount || 0) + 1;
      return cached.value;
    }

    const result = fn(...args);
    cache.set(key, {
      value: result,
      deps: [...args],
      timestamp: Date.now(),
      hitCount: 1,
    });

    return result;
  };
}

/**
 * Enhances a SignalTree with memoization capabilities
 */
export function withMemoization<T extends StateObject>(
  config: MemoizationConfig = {}
): (tree: SignalTree<T>) => MemoizedSignalTree<T> {
  const { enabled = true, maxCacheSize = 1000, ttl } = config;

  return (tree: SignalTree<T>): MemoizedSignalTree<T> => {
    if (!enabled) {
      return tree as MemoizedSignalTree<T>;
    }

    // Initialize cache for this tree
    const cache = new Map<string, CacheEntry<unknown>>();
    memoizationCache.set(tree as object, cache);

    // Limit cache size function
    const enforceCacheLimit = () => {
      if (cache.size > maxCacheSize) {
        // Remove oldest entries (simple LRU)
        const entries = Array.from(cache.entries());
        entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

        const toRemove = entries.slice(0, cache.size - maxCacheSize + 1);
        toRemove.forEach(([key]) => cache.delete(key));
      }
    };

    // Store original update method
    const originalUpdate = tree.update;

    // Add memoized update method
    tree.memoizedUpdate = (
      updater: (current: T) => Partial<T>,
      cacheKey?: string
    ) => {
      const key = cacheKey || `update_${Date.now()}`;
      const currentState = tree.unwrap();

      // Check cache
      const cached = cache.get(key);
      if (cached && deepEqual(cached.deps, [currentState])) {
        // Apply cached result
        originalUpdate.call(tree, () => cached.value as Partial<T>);
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

      // Apply update
      originalUpdate.call(tree, () => result);

      // Enforce cache limits after adding new entry
      enforceCacheLimit();
    };

    // Add cache management methods
    tree.clearMemoCache = (key?: string) => {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    };

    tree.getCacheStats = () => {
      let totalHits = 0;
      let totalMisses = 0;

      for (const entry of cache.values()) {
        totalHits += entry.hitCount || 0;
        // For simplicity, we'll estimate misses as half of hits
        totalMisses += Math.floor((entry.hitCount || 0) / 2);
      }

      const hitRate =
        totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

      return {
        size: cache.size,
        hitRate,
        totalHits,
        totalMisses,
        keys: Array.from(cache.keys()),
      };
    };

    // Clean up expired entries if TTL is set
    if (ttl) {
      const cleanup = () => {
        const now = Date.now();
        for (const [key, entry] of cache.entries()) {
          if (entry.timestamp && now - entry.timestamp > ttl) {
            cache.delete(key);
          }
        }
      };

      // Run cleanup periodically
      const intervalId = setInterval(cleanup, ttl);

      // Store interval ID for cleanup (handle Node.js vs browser differences)
      (
        tree as unknown as {
          _memoCleanupInterval?: ReturnType<typeof setInterval>;
        }
      )._memoCleanupInterval = intervalId;
    }

    // Override update to enforce cache limits
    const enhancedUpdate = tree.update;
    tree.update = (updater: (current: T) => Partial<T>) => {
      const result = enhancedUpdate.call(tree, updater);
      enforceCacheLimit();
      return result;
    };

    return tree as MemoizedSignalTree<T>;
  };
}

/**
 * Convenience function to enable memoization with default settings
 */
export function enableMemoization<T extends StateObject>() {
  return withMemoization<T>({ enabled: true });
}

/**
 * High-performance memoization with aggressive caching
 */
export function withHighPerformanceMemoization<T extends StateObject>() {
  return withMemoization<T>({
    enabled: true,
    maxCacheSize: 10000,
    ttl: 300000, // 5 minutes
  });
}

/**
 * Clear all memoization caches
 */
export function clearAllCaches(): void {
  // Clear all tree caches
  memoizationCache.forEach((cache: Map<string, CacheEntry<unknown>>) => {
    cache.clear();
  });
}

/**
 * Get global cache statistics
 */
export function getGlobalCacheStats() {
  let totalSize = 0;
  let totalHits = 0;
  let treeCount = 0;

  // Type the cache parameter properly
  memoizationCache.forEach((cache: Map<string, CacheEntry<unknown>>) => {
    treeCount++;
    totalSize += cache.size;

    for (const entry of cache.values()) {
      totalHits += entry.hitCount || 0;
    }
  });

  return {
    treeCount,
    totalSize,
    totalHits,
    averageCacheSize: treeCount > 0 ? totalSize / treeCount : 0,
  };
}

// Type augmentation for memoization methods
declare module '@signaltree/core' {
  interface SignalTree<T> {
    memoizedUpdate?: (
      updater: (current: T) => Partial<T>,
      cacheKey?: string
    ) => void;
    clearMemoCache?: (key?: string) => void;
    getCacheStats?: () => {
      size: number;
      totalHits: number;
      keys: string[];
    };
  }
}
