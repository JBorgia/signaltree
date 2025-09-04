import { isNodeAccessor, SignalTree } from '@signaltree/core';

/**
 * Extended SignalTree interface with memoization capabilities
 * Uses the same unconstrained recursive typing approach as core
 */
interface MemoizedSignalTree<T> extends SignalTree<T> {
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

// Use Map for global cache management (WeakMap doesn't support iteration)
const memoizationCache = new Map<object, Map<string, CacheEntry<unknown>>>();

// Track cache for cleanup
const cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [obj, cache] of memoizationCache.entries()) {
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > DEFAULT_TTL) {
        cache.delete(key);
      }
    }
    // Remove empty caches
    if (cache.size === 0) {
      memoizationCache.delete(obj);
    }
  }
}, 60000); // Clean up every minute

/**
 * Cleanup the cache interval on app shutdown
 */
export function cleanupMemoizationCache(): void {
  clearInterval(cacheCleanupInterval);
  memoizationCache.clear();
}

/**
 * Memoization configuration options
 */
interface MemoizationConfig {
  enabled?: boolean;
  maxCacheSize?: number;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Deep equality check for dependency comparison
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      ) {
        return false;
      }
    }
    return true;
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
  return `${fn.name || 'anonymous'}_${JSON.stringify(args)}`;
}

/**
 * Memoization function that caches expensive computations with enhanced cache management
 */
export function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string,
  config: MemoizationConfig = {}
): (...args: TArgs) => TReturn {
  const cache = new Map<string, CacheEntry<TReturn>>();
  const maxSize = config.maxCacheSize ?? MAX_CACHE_SIZE;
  const ttl = config.ttl ?? DEFAULT_TTL;

  const cleanExpiredEntries = () => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > ttl) {
        cache.delete(key);
      }
    }
  };

  const evictLRUEntries = () => {
    if (cache.size >= maxSize) {
      // Find the least recently used entry (lowest hitCount)
      let lruKey = '';
      let minHitCount = Infinity;

      for (const [key, entry] of cache.entries()) {
        if (entry.hitCount < minHitCount) {
          minHitCount = entry.hitCount;
          lruKey = key;
        }
      }

      if (lruKey) {
        cache.delete(lruKey);
      }
    }
  };

  return (...args: TArgs): TReturn => {
    // Clean expired entries periodically
    cleanExpiredEntries();

    const key = keyFn
      ? keyFn(...args)
      : generateCacheKey(
          fn as (...args: unknown[]) => unknown,
          args as unknown[]
        );
    const cached = cache.get(key);

    // If using custom key function, trust the key; otherwise check deep equality
    if (cached && (keyFn || deepEqual(cached.deps, args))) {
      cached.hitCount += 1;
      return cached.value;
    }

    // Evict entries if cache is too large
    evictLRUEntries();

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
 * Enhances a SignalTree with memoization capabilities
 * Uses unconstrained recursive typing - no limitations on T
 */
export function withMemoization<T>(
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

    // Store original callable tree function
    const originalTreeCall = tree.bind(tree);

    // Add memoized update method
    (tree as MemoizedSignalTree<T>).memoizedUpdate = (
      updater: (current: T) => Partial<T>,
      cacheKey?: string
    ) => {
      const key = cacheKey || `update_${Date.now()}`;
      const currentState = originalTreeCall();

      // Check cache
      const cached = cache.get(key);
      if (cached && deepEqual(cached.deps, [currentState])) {
        // Apply cached result - use callable interface to set the partial update
        const cachedUpdate = cached.value as Partial<T>;
        Object.entries(cachedUpdate).forEach(([propKey, value]) => {
          const property = (tree.state as Record<string, unknown>)[propKey];
          if (property && 'set' in (property as object)) {
            // It's a WritableSignal - use .set()
            (property as { set: (value: unknown) => void }).set(value);
          } else if (isNodeAccessor(property)) {
            // It's a NodeAccessor - use callable syntax
            (property as (value: unknown) => void)(value);
          }
        });
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
      Object.entries(result).forEach(([propKey, value]) => {
        const property = (tree.state as Record<string, unknown>)[propKey];
        if (property && 'set' in (property as object)) {
          // It's a WritableSignal - use .set()
          (property as { set: (value: unknown) => void }).set(value);
        } else if (isNodeAccessor(property)) {
          // It's a NodeAccessor - use callable syntax
          (property as (value: unknown) => void)(value);
        }
      });

      // Enforce cache limits after adding new entry
      enforceCacheLimit();
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
