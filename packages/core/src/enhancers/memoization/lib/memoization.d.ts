import type { SignalTree } from '../../../lib/types';
export interface MemoizedSignalTree<T> extends SignalTree<T> {
    memoizedUpdate: (updater: (current: T) => Partial<T>, cacheKey?: string) => void;
    clearMemoCache: (key?: string) => void;
    getCacheStats: () => {
        size: number;
        hitRate: number;
        totalHits: number;
        totalMisses: number;
        keys: string[];
    };
}
export declare function cleanupMemoizationCache(): void;
export interface MemoizationConfig {
    enabled?: boolean;
    maxCacheSize?: number;
    ttl?: number;
    equality?: 'deep' | 'shallow' | 'reference';
    enableLRU?: boolean;
}
export declare function memoize<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn, keyFn?: (...args: TArgs) => string, config?: MemoizationConfig): (...args: TArgs) => TReturn;
export declare function memoizeShallow<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn, keyFn?: (...args: TArgs) => string): (...args: TArgs) => TReturn;
export declare function memoizeReference<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn, keyFn?: (...args: TArgs) => string): (...args: TArgs) => TReturn;
export declare const MEMOIZATION_PRESETS: {
    readonly selector: {
        readonly equality: "reference";
        readonly maxCacheSize: 10;
        readonly enableLRU: false;
        readonly ttl: undefined;
    };
    readonly computed: {
        readonly equality: "shallow";
        readonly maxCacheSize: 100;
        readonly enableLRU: false;
        readonly ttl: undefined;
    };
    readonly deepState: {
        readonly equality: "deep";
        readonly maxCacheSize: 1000;
        readonly enableLRU: true;
        readonly ttl: number;
    };
    readonly highFrequency: {
        readonly equality: "reference";
        readonly maxCacheSize: 5;
        readonly enableLRU: false;
        readonly ttl: undefined;
    };
};
export declare function withSelectorMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withComputedMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withDeepStateMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withHighFrequencyMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withMemoization<T>(config?: MemoizationConfig): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function enableMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withHighPerformanceMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withLightweightMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function withShallowMemoization<T>(): (tree: SignalTree<T>) => MemoizedSignalTree<T>;
export declare function clearAllCaches(): void;
export declare function getGlobalCacheStats(): {
    treeCount: number;
    totalSize: number;
    totalHits: number;
    averageCacheSize: number;
};
