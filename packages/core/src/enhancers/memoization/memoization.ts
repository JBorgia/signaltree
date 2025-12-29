/**
 * v6 Memoization Enhancer
 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & MemoizationMethods<S>
 *
 * Provides intelligent caching for expensive computations and state derivations.
 */
import { computed, Signal } from '@angular/core';


import type {
  SignalTreeBase,
  MemoizationMethods,
  MemoizationConfig,
} from '../../lib/types';

// ============================================================================
// Types
// ============================================================================

type EqualityStrategy = 'deep' | 'shallow' | 'reference';

interface CacheEntry<R> {
  value: R;
  deps: readonly unknown[];
  timestamp: number;
  hitCount: number;
}

interface SignalCacheEntry<R> {
  signal: Signal<R>;
  hits: number;
  createdAt: number;
}

// ============================================================================
// Equality Functions
// ============================================================================

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    let countA = 0;
    for (const key in objA) {
      if (!Object.prototype.hasOwnProperty.call(objA, key)) continue;
      countA++;
      if (!(key in objB) || objA[key] !== objB[key]) return false;
    }

    let countB = 0;
    for (const key in objB) {
      if (Object.prototype.hasOwnProperty.call(objB, key)) countB++;
    }

    return countA === countB;
  }

  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
}

function getEqualityFn(
  strategy: EqualityStrategy
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

// ============================================================================
// Cache Key Generation
// ============================================================================

function generateCacheKey(
  fn: (...args: unknown[]) => unknown,
  args: unknown[]
): string {
  try {
    return `${fn.name || 'anonymous'}_${JSON.stringify(args)}`;
  } catch {
    return `${fn.name || 'anonymous'}_${args.length}`;
  }
}

// ============================================================================
// Cache Store
// ============================================================================

interface CacheStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  forEach(callback: (value: V, key: string) => void): void;
  keys(): IterableIterator<string>;
}

function createCacheStore<V>(
  maxSize: number,
  enableLRU: boolean
): CacheStore<V> {
  const store = new Map<string, V>();

  const evictIfNeeded = (): void => {
    if (!enableLRU || store.size <= maxSize) return;
    // Remove oldest entry (first in map)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) {
      store.delete(firstKey);
    }
  };

  return {
    get(key: string): V | undefined {
      const value = store.get(key);
      if (enableLRU && value !== undefined) {
        // Move to end (most recently used)
        store.delete(key);
        store.set(key, value);
      }
      return value;
    },
    set(key: string, value: V): void {
      if (store.has(key)) {
        store.delete(key);
      }
      store.set(key, value);
      evictIfNeeded();
    },
    delete(key: string): boolean {
      return store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    size(): number {
      return store.size;
    },
    forEach(callback: (value: V, key: string) => void): void {
      store.forEach((value, key) => callback(value, key));
    },
    keys(): IterableIterator<string> {
      return store.keys();
    },
  };
}

// ============================================================================
// Global Cache Management
// ============================================================================

const globalCaches = new Map<object, CacheStore<CacheEntry<unknown>>>();

/**
 * Clear all memoization caches across all trees
 */
export function clearAllCaches(): void {
  globalCaches.forEach((cache) => cache.clear());
  globalCaches.clear();
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
  let totalSize = 0;
  let totalHits = 0;
  let treeCount = 0;

  globalCaches.forEach((cache) => {
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

// ============================================================================
// Preset Configurations
// ============================================================================

export const MEMOIZATION_PRESETS = {
  selector: {
    equality: 'reference' as const,
    maxCacheSize: 10,
    enableLRU: false,
    ttl: undefined,
  },
  computed: {
    equality: 'shallow' as const,
    maxCacheSize: 100,
    enableLRU: false,
    ttl: undefined,
  },
  deepState: {
    equality: 'deep' as const,
    maxCacheSize: 1000,
    enableLRU: true,
    ttl: 5 * 60 * 1000,
  },
  highFrequency: {
    equality: 'reference' as const,
    maxCacheSize: 5,
    enableLRU: false,
    ttl: undefined,
  },
} as const;

// ============================================================================
// Main Enhancer Implementation
// ============================================================================

/**
 * Enhances a SignalTree with memoization capabilities.
 *
 * @param config - Memoization configuration
 * @returns Polymorphic enhancer function
 *
 * @example
 * ```typescript
 * const tree = signalTree({ users: [], filter: '' })
 *   .with(withMemoization({ maxCacheSize: 200 }));
 *
 * // Create memoized selectors
 * const activeUsers = tree.memoize(state =>
 *   state.users.filter(u => u.active)
 * );
 *
 * // Memoized updates
 * tree.memoizedUpdate(state => ({
 *   users: expensiveTransform(state.users)
 * }));
 * ```
 */
export function withMemoization(
  config: MemoizationConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & MemoizationMethods<S> {
  const {
    enabled = true,
    maxCacheSize = 100,
    ttl,
    enableLRU = true,
    equality = 'deep',
  } = config;

  return <S>(
    tree: SignalTreeBase<S>
  ): SignalTreeBase<S> & MemoizationMethods<S> => {
    // Disabled path
    if (!enabled) {
      const noopMethods: MemoizationMethods<S> = {
        memoize<R>(selector: (state: S) => R): Signal<R> {
          return computed(() => selector(tree() as S));
        },
        memoizedUpdate(updater: (current: S) => Partial<S>): void {
          const current = tree() as S;
          const updates = updater(current);
          applyPartialUpdate(tree, updates);
        },
        clearMemoCache(): void { return; },
        clearCache(): void { return; },
        getCacheStats() {
          return {
            size: 0,
            hitRate: 0,
            totalHits: 0,
            totalMisses: 0,
            keys: [],
          };
        },
      };
      return Object.assign(tree, noopMethods);
    }

    // Initialize caches
    const signalCache = new Map<string, SignalCacheEntry<unknown>>();
    const updateCache = createCacheStore<CacheEntry<Partial<S>>>(
      maxCacheSize,
      enableLRU
    );
    let totalHits = 0;
    let totalMisses = 0;

    // Register for global tracking
    globalCaches.set(
      tree as object,
      updateCache as unknown as CacheStore<CacheEntry<unknown>>
    );

    const equalityFn = getEqualityFn(equality);

    // TTL cleanup
    const cleanupExpired = (): void => {
      if (!ttl) return;
      const now = Date.now();

      for (const [key, entry] of signalCache) {
        if (now - entry.createdAt > ttl) {
          signalCache.delete(key);
        }
      }

      updateCache.forEach((entry, key) => {
        if (now - entry.timestamp > ttl) {
          updateCache.delete(key);
        }
      });
    };

    // LRU eviction for signal cache
    const evictSignalCacheIfNeeded = (): void => {
      if (!enableLRU || signalCache.size <= maxCacheSize) return;

      let minHits = Infinity;
      let minKey: string | null = null;

      for (const [key, entry] of signalCache) {
        if (entry.hits < minHits) {
          minHits = entry.hits;
          minKey = key;
        }
      }

      if (minKey) {
        signalCache.delete(minKey);
      }
    };

    // Set up periodic TTL cleanup
    let cleanupInterval: ReturnType<typeof setInterval> | null = null;
    if (ttl) {
      cleanupInterval = setInterval(cleanupExpired, ttl);
    }

    const methods: MemoizationMethods<S> = {
      memoize<R>(selector: (state: S) => R, cacheKey?: string): Signal<R> {
        const key = cacheKey ?? selector.toString();

        // Check existing
        const existing = signalCache.get(key) as
          | SignalCacheEntry<R>
          | undefined;
        if (existing) {
          if (ttl && Date.now() - existing.createdAt > ttl) {
            signalCache.delete(key);
          } else {
            existing.hits++;
            totalHits++;
            return existing.signal;
          }
        }

        totalMisses++;

        // Create memoized computed
        const memoized = computed(() => selector(tree() as S));

        signalCache.set(key, {
          signal: memoized as Signal<unknown>,
          hits: 0,
          createdAt: Date.now(),
        });

        evictSignalCacheIfNeeded();

        return memoized;
      },

      memoizedUpdate(
        updater: (current: S) => Partial<S>,
        cacheKey?: string
      ): void {
        const currentState = tree() as S;
        const key =
          cacheKey ??
          generateCacheKey(updater as (...args: unknown[]) => unknown, [
            currentState,
          ]);

        // Check cache
        const cached = updateCache.get(key);
        if (cached && equalityFn(cached.deps, [currentState])) {
          totalHits++;
          cached.hitCount++;
          applyPartialUpdate(tree, cached.value);
          return;
        }

        totalMisses++;

        // Compute and cache
        const result = updater(currentState);
        updateCache.set(key, {
          value: result,
          deps: [currentState],
          timestamp: Date.now(),
          hitCount: 1,
        });

        applyPartialUpdate(tree, result);
      },

      clearMemoCache(key?: string): void {
        if (key) {
          signalCache.delete(key);
          updateCache.delete(key);
        } else {
          signalCache.clear();
          updateCache.clear();
          totalHits = 0;
          totalMisses = 0;
        }
      },

      clearCache(key?: string): void {
        this.clearMemoCache(key);
      },

      getCacheStats() {
        cleanupExpired();
        const total = totalHits + totalMisses;
        const allKeys = [
          ...Array.from(signalCache.keys()),
          ...Array.from(updateCache.keys()),
        ];

        return {
          size: signalCache.size + updateCache.size(),
          hitRate: total > 0 ? totalHits / total : 0,
          totalHits,
          totalMisses,
          keys: allKeys,
        };
      },
    };

    // Override destroy to cleanup
    const originalDestroy = tree.destroy?.bind(tree);
    (tree as unknown as { destroy: () => void }).destroy = () => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
      signalCache.clear();
      updateCache.clear();
      globalCaches.delete(tree as object);
      if (originalDestroy) {
        originalDestroy();
      }
    };

    return Object.assign(tree, methods);
  };
}

// ============================================================================
// Helper: Apply Partial Update
// ============================================================================

function applyPartialUpdate<S>(
  tree: SignalTreeBase<S>,
  updates: Partial<S>
): void {
  const state = tree.state as Record<string, unknown>;

  for (const [key, value] of Object.entries(updates)) {
    const node = state[key];
    if (node && typeof node === 'function') {
      (node as (v: unknown) => void)(value);
    } else if (node && typeof node === 'object' && 'set' in node) {
      (node as { set: (v: unknown) => void }).set(value);
    }
  }
}

// ============================================================================
// Preset Helpers
// ============================================================================

export function withSelectorMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization(MEMOIZATION_PRESETS.selector);
}

export function withComputedMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization(MEMOIZATION_PRESETS.computed);
}

export function withDeepStateMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization(MEMOIZATION_PRESETS.deepState);
}

export function withHighFrequencyMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization(MEMOIZATION_PRESETS.highFrequency);
}

export function withHighPerformanceMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 10000,
    ttl: 300000,
    equality: 'shallow',
    enableLRU: true,
  });
}

export function withLightweightMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 100,
    ttl: undefined,
    equality: 'reference',
    enableLRU: false,
  });
}

export function withShallowMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization({
    enabled: true,
    maxCacheSize: 1000,
    ttl: 60000,
    equality: 'shallow',
    enableLRU: true,
  });
}

export function enableMemoization(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & MemoizationMethods<S> {
  return withMemoization({ enabled: true });
}
