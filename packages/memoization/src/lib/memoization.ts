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

// Use Map for global cache management (we keep iteration for diagnostics).
// Note: we avoid starting any global timers at module import to prevent
// background timer leaks in long-running processes; cleanup is performed
// opportunistically inside hot paths (probabilistic) or via explicit APIs.
const memoizationCache = new Map<object, Map<string, CacheEntry<unknown>>>();

// Optional module-level handle for any externally-created cleanup interval.
// Declared so references elsewhere (cleanup helpers) type-check across Node/browser.
let cacheCleanupInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Cleanup the cache interval on app shutdown
 */
export function cleanupMemoizationCache(): void {
  if (cacheCleanupInterval) {
    try {
      clearInterval(cacheCleanupInterval as unknown as number);
    } catch {
      /* best-effort cleanup */
    }
    cacheCleanupInterval = undefined;
  }
  memoizationCache.clear();
}

/**
 * Memoization configuration options
 */
interface MemoizationConfig {
  enabled?: boolean;
  maxCacheSize?: number;
  ttl?: number; // Time to live in milliseconds
  equality?: 'deep' | 'shallow' | 'reference'; // Equality comparison strategy
  enableLRU?: boolean; // Enable LRU eviction (has overhead)
}

/**
 * Shallow equality check for dependency comparison
 * Much faster than deep equality for objects with primitive values
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (objA[key] !== objB[key]) return false;
    }
    return true;
  }

  return false;
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
  const cache = new Map<string, CacheEntry<TReturn>>();
  const maxSize = config.maxCacheSize ?? MAX_CACHE_SIZE;
  const ttl = config.ttl ?? DEFAULT_TTL;
  // Use shallow equality by default to avoid expensive deep comparisons
  const equality = getEqualityFn(config.equality ?? 'shallow');
  // Disable LRU by default to avoid hidden CPU overhead
  const enableLRU = config.enableLRU ?? false;

  const cleanExpiredEntries = () => {
    if (!ttl) return; // Skip if TTL is disabled
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp && now - entry.timestamp > ttl) {
        cache.delete(key);
      }
    }
  };

  const evictLRUEntries = () => {
    if (!enableLRU || cache.size < maxSize) return;

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

    // Evict entries if cache is too large (only if LRU is enabled)
    if (enableLRU) {
      evictLRUEntries();
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
    if (!enabled) {
      return tree as MemoizedSignalTree<T>;
    }

    // Initialize cache for this tree
    const cache = new Map<string, CacheEntry<unknown>>();
    memoizationCache.set(tree as object, cache);

    const equalityFn = getEqualityFn(equality);

    // Limit cache size function
    const enforceCacheLimit = () => {
      if (!enableLRU || cache.size <= maxCacheSize) return;

      // Remove oldest entries (simple LRU)
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

      const toRemove = entries.slice(0, cache.size - maxCacheSize + 1);
      toRemove.forEach(([key]) => cache.delete(key));
    };

    // Store original callable tree function
    const originalTreeCall = tree.bind(tree);

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

    // If we created a periodic cleanup for this tree, ensure callers can clear it
    const maybeInterval = (
      tree as unknown as {
        _memoCleanupInterval?: ReturnType<typeof setInterval>;
      }
    )._memoCleanupInterval;
    if (maybeInterval && typeof maybeInterval === 'number') {
      // When the tree cache is cleared, also clear the interval
      const origClear = (tree as MemoizedSignalTree<T>).clearMemoCache.bind(
        tree as MemoizedSignalTree<T>
      );
      (tree as MemoizedSignalTree<T>).clearMemoCache = (key?: string) => {
        origClear(key);
        try {
          clearInterval(maybeInterval as unknown as number);
        } catch {
          /* best-effort */
        }
      };
    }

    // Intentionally do NOT attach memoization helpers to `tree.$` to preserve
    // the "callable-only nodes" invariant for serialization safety.

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
  // Clear all tree caches
  memoizationCache.forEach((cache: Map<string, CacheEntry<unknown>>, tree) => {
    cache.clear();
    try {
      const interval = (
        tree as unknown as {
          _memoCleanupInterval?: ReturnType<typeof setInterval>;
        }
      )._memoCleanupInterval;
      if (interval) {
        clearInterval(interval as unknown as number);
      }
    } catch {
      /* best-effort */
    }
  });
  memoizationCache.clear();
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
