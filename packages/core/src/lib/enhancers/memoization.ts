import { computed, Signal } from '@angular/core';

import { snapshotState } from '../utils';

import type {
  SignalTreeBase as SignalTree,
  MemoizationMethods,
  Enhancer,
  CacheStats,
} from '../types';
export interface MemoizationConfig {
  maxCacheSize?: number;
  ttlMs?: number;
  useLRU?: boolean;
}

export function withMemoization(
  config: MemoizationConfig = {}
): <S>(tree: SignalTree<S>) => SignalTree<S> & MemoizationMethods<S> {
  const { maxCacheSize = 100, ttlMs = 0, useLRU = true } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & MemoizationMethods<S> => {
    const cache = new Map<
      string,
      {
        signal: Signal<unknown>;
        hits: number;
        createdAt: number;
        lastAccessedAt: number;
      }
    >();
    let autoKey = 0;
    let totalHits = 0;
    let totalMisses = 0;

    const evictLRU = () => {
      if (cache.size <= maxCacheSize) return;
      if (useLRU) {
        let oldestKey: string | null = null;
        let oldest = Infinity;
        for (const [k, v] of cache) {
          if (v.lastAccessedAt < oldest) {
            oldest = v.lastAccessedAt;
            oldestKey = k;
          }
        }
        if (oldestKey) cache.delete(oldestKey);
      } else {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
    };

    const methods: MemoizationMethods<S> = {
      memoize<R>(fn: (state: S) => R, cacheKey?: string): Signal<R> {
        const key = cacheKey ?? `__auto_${autoKey++}`;
        const existing = cache.get(key);
        if (existing) {
          existing.hits++;
          existing.lastAccessedAt = Date.now();
          totalHits++;
          return existing.signal as Signal<R>;
        }
        totalMisses++;
        evictLRU();
        const sig = computed(() => fn(snapshotState((tree as any).state) as S));
        cache.set(key, {
          signal: sig as unknown as Signal<unknown>,
          hits: 0,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        });
        return sig as Signal<R>;
      },

      memoizedUpdate(updater, cacheKey) {
        const current = snapshotState((tree as any).state) as S;
        const updates = updater(current);
        (tree as any)((cur: S) => ({ ...cur, ...updates }));
        if (cacheKey) cache.delete(cacheKey);
      },

      clearMemoCache(key?: string) {
        if (key) cache.delete(key);
        else cache.clear();
      },

      getCacheStats(): CacheStats {
        const total = totalHits + totalMisses;
        return {
          size: cache.size,
          hitRate: total ? totalHits / total : 0,
          totalHits,
          totalMisses,
          keys: Array.from(cache.keys()),
        };
      },
    };

    const originalDestroy = (tree as any).destroy?.bind(tree);
    (tree as any).destroy = () => {
      cache.clear();
      originalDestroy?.();
    };

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = {
    name: 'withMemoization',
    provides: ['memoize', 'clearMemoCache', 'memoizedUpdate', 'getCacheStats'],
  };
  return enhancer;
}
