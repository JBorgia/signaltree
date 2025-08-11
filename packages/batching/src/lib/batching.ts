import { SignalTree, StateObject } from '@signaltree/core';

// Batching state
interface BatchedUpdate {
  fn: () => void;
  startTime: number;
  depth?: number;
  path?: string;
}

let updateQueue: Array<BatchedUpdate> = [];
let isUpdating = false;

/**
 * Core batching function that queues updates and processes them in microtasks.
 * Updates are sorted by depth (deepest first) for optimal update propagation.
 */
function batchUpdates(fn: () => void, path?: string): void {
  const startTime = performance.now();
  const depth = path ? parsePath(path).length : 0;

  updateQueue.push({ fn, startTime, depth, path });

  if (!isUpdating) {
    isUpdating = true;
    queueMicrotask(() => {
      const queue = updateQueue.slice();
      updateQueue = [];
      isUpdating = false;

      // Sort by depth (deepest first) for optimal update propagation
      queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

      queue.forEach(({ fn }) => fn());
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
  config: {
    enabled?: boolean;
    maxBatchSize?: number;
    batchTimeoutMs?: number;
  } = {}
): (tree: SignalTree<T>) => SignalTree<T> {
  const { enabled = true, maxBatchSize = 100 } = config;

  return (tree: SignalTree<T>) => {
    if (!enabled) {
      return tree; // Return tree unchanged if batching is disabled
    }

    // Store original update method
    const originalUpdate = tree.update;

    // Override batchUpdate with real batching functionality
    tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
      batchUpdates(() => {
        originalUpdate.call(tree, updater);
      });
    };

    // Optionally override regular update to use batching
    tree.update = (updater: (current: T) => Partial<T>) => {
      if (updateQueue.length < maxBatchSize) {
        // Use batching for regular updates too
        batchUpdates(() => {
          originalUpdate.call(tree, updater);
        });
      } else {
        // Fall back to immediate update if queue is too large
        originalUpdate.call(tree, updater);
      }
    };

    return tree;
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
