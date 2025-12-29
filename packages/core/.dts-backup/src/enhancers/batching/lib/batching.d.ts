import type { SignalTreeBase as SignalTree } from '../../../lib/types';
interface BatchingConfig {
  enabled?: boolean;
  maxBatchSize?: number;
  autoFlushDelay?: number;
  batchTimeoutMs?: number;
}
interface BatchingSignalTree<T> extends SignalTree<T> {
  batchUpdate(updater: (current: T) => Partial<T>): void;
}
export declare function withBatching<T>(
  config?: BatchingConfig
): (tree: SignalTree<T>) => BatchingSignalTree<T>;
export declare function withHighPerformanceBatching<T>(): (
  tree: SignalTree<T>
) => BatchingSignalTree<T>;
export declare function flushBatchedUpdates(): void;
export declare function hasPendingUpdates(): boolean;
export declare function getBatchQueueSize(): number;
export {};
