import type { ISignalTree, BatchingConfig, BatchingMethods } from '../../lib/types';
export declare function batching(config?: BatchingConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T>;
export declare function highPerformanceBatching(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T>;
export declare function batchingWithConfig(config?: BatchingConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T>;
export declare function flushBatchedUpdates(): void;
export declare function hasPendingUpdates(): boolean;
export declare function getBatchQueueSize(): number;
export declare const withBatching: ((config?: BatchingConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T>) & {
    highPerformance: typeof highPerformanceBatching;
};
