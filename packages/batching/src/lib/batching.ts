import { SignalTree, StateObject } from '@signaltree/core';

/**
 * Configuration options for batching
 */
interface BatchingConfig {
  enabled?: boolean;
  maxBatchSize?: number;
  autoFlushDelay?: number;
  batchTimeoutMs?: number;
}

/**
 * Enhanced SignalTree interface with batching capabilities
 */
interface BatchingSignalTree<T extends StateObject> extends SignalTree<T> {
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

// Batching state
interface BatchedUpdate {
  fn: () => void;
  startTime: number;
  depth?: number;
  path?: string;
}

let updateQueue: Array<BatchedUpdate> = [];
let isUpdating = false;
let currentBatchingConfig: BatchingConfig = {};

/**
 * Core batching function that queues updates and processes them in microtasks.
 * Updates are sorted by depth (deepest first) for optimal update propagation.
 */
function batchUpdates(fn: () => void, path?: string): void {
  const startTime = performance.now();
  const depth = path ? parsePath(path).length : 0;

  updateQueue.push({ fn, startTime, depth, path });

  // Check if we need to process immediately due to maxBatchSize
  const shouldFlushImmediately =
    currentBatchingConfig.maxBatchSize &&
    updateQueue.length >= currentBatchingConfig.maxBatchSize;

  if (!isUpdating) {
    isUpdating = true;

    const processQueue = () => {
      const queue = updateQueue.slice();
      updateQueue = [];
      isUpdating = false;

      // Sort by depth (deepest first) for optimal update propagation
      queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

      queue.forEach(({ fn }) => fn());
    };

    if (shouldFlushImmediately) {
      // Process immediately when maxBatchSize is reached
      processQueue();
    } else {
      // Use microtask for normal batching
      queueMicrotask(processQueue);
    }
  } else if (shouldFlushImmediately) {
    // If we're already updating but hit maxBatchSize,
    // schedule immediate processing after current batch
    queueMicrotask(() => {
      if (updateQueue.length > 0 && !isUpdating) {
        const queue = updateQueue.slice();
        updateQueue = [];

        queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
        queue.forEach(({ fn }) => fn());
      }
    });
  }
}

/**
 * Simple path parser for determining update depth
 */
function parsePath(path: string): string[] {
  return path.split('.');
}

/**
 * Enhances a SignalTree with batching capabilities.
 *
 * @param config - Optional batching configuration
 * @returns Function that takes a tree and returns enhanced tree
 */
export function withBatching<T extends StateObject>(
  config: BatchingConfig = {}
): (tree: SignalTree<T>) => BatchingSignalTree<T> {
  const { enabled = true } = config;

  // Update global config for this batching instance
  currentBatchingConfig = { ...currentBatchingConfig, ...config };

  return (tree: SignalTree<T>): BatchingSignalTree<T> => {
    if (!enabled) {
      return tree as BatchingSignalTree<T>;
    }

    // Store the original update method
    const originalUpdate = tree.update.bind(tree);

    // Override update method with batching
    tree.update = (updater: (current: T) => Partial<T>) => {
      // Always use batching for regular updates
      batchUpdates(() => originalUpdate(updater));
    };

    // Add batchUpdate method to the tree
    const enhancedTree = tree as BatchingSignalTree<T>;
    enhancedTree.batchUpdate = (updater: (current: T) => Partial<T>) => {
      batchUpdates(() => originalUpdate(updater));
    };

    return enhancedTree;
  };
}

/**
 * Convenience function to enable batching with default settings
 */
export function enableBatching<T extends StateObject>() {
  return withBatching<T>({ enabled: true });
}

/**
 * Convenience function to create high-performance batching
 */
export function withHighPerformanceBatching<T extends StateObject>() {
  return withBatching<T>({
    enabled: true,
    maxBatchSize: 200,
    batchTimeoutMs: 0,
  });
}

/**
 * Manually flush all pending batched updates immediately.
 * Useful for testing or when you need to ensure updates are applied synchronously.
 */
export function flushBatchedUpdates(): void {
  console.log(
    'flushBatchedUpdates called, queue length:',
    updateQueue.length,
    'isUpdating:',
    isUpdating
  );
  if (updateQueue.length > 0) {
    // Force flush regardless of isUpdating state
    const queue = updateQueue.slice();
    updateQueue = [];
    isUpdating = false; // Reset the updating flag
    console.log('Flushing', queue.length, 'updates');

    // Sort by depth (deepest first) for optimal update propagation
    queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    queue.forEach(({ fn }) => {
      console.log('Executing queued function');
      fn();
    });
  } else {
    console.log('Flush skipped - queue empty');
  }
}

/**
 * Check if there are pending batched updates
 */
export function hasPendingUpdates(): boolean {
  return updateQueue.length > 0;
}

/**
 * Get the current batch queue size (for debugging/monitoring)
 */
export function getBatchQueueSize(): number {
  return updateQueue.length;
}
