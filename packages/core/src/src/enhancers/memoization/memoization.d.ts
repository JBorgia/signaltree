import type { ISignalTree } from '../../lib/types';
export declare function cleanupMemoizationCache(): void;
import type { MemoizationConfig, MemoizationMethods } from '../../lib/types';
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
export declare function selectorMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function computedMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function deepStateMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function highFrequencyMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare const withMemoization: ((config?: MemoizationConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>) & {
    selector: typeof selectorMemoization;
    computed: typeof computedMemoization;
    deep: typeof deepStateMemoization;
    fast: typeof highFrequencyMemoization;
};
export declare function memoization(config?: MemoizationConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function enableMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function highPerformanceMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function lightweightMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function shallowMemoization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;
export declare function clearAllCaches(): void;
export declare function getGlobalCacheStats(): {
    treeCount: number;
    totalSize: number;
    totalHits: number;
    averageCacheSize: number;
};
