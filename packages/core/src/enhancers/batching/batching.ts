import { parsePath } from '@signaltree/shared';

import { applyState, isNodeAccessor } from '../../lib/utils';

import type { TreeNode } from '../../lib/utils';

import type {
  SignalTreeBase as SignalTree,
  Enhancer,
  BatchingConfig,
} from '../../lib/types';

/**
 * Configuration options for intelligent batching behavior.
 */

/** Enhanced SignalTree interface with batching methods */
interface BatchingSignalTree<T> extends SignalTree<T> {
  // Public, user-facing batching API (new v6 shape)
  batch(fn: () => void): void;
  // Legacy/internal batchUpdate preserved for compatibility
  batchUpdate?(updater: (current: T) => Partial<T>): void;
}

/** Public methods surface added by the batching enhancer */
export type BatchingMethods<T> = import('../../lib/types').BatchingMethods<T>;

/** Represents a queued update in the batching system */
interface BatchedUpdate {
  fn: () => void;
  startTime: number;
  depth?: number;
  path?: string;
}

/** Global queue for batched updates awaiting processing */
let updateQueue: Array<BatchedUpdate> = [];
/** Flag to prevent recursive batch processing */
let isUpdating = false;
/** Timeout ID for scheduled flush operations */
let flushTimeoutId: number | undefined;
/** Current batching configuration */
let currentBatchingConfig: BatchingConfig = {};

function addToQueue(
  update: BatchedUpdate,
  config: BatchingConfig = currentBatchingConfig
): boolean {
  const maxSize = config.maxBatchSize ?? 100;

  if (update.path) {
    updateQueue = updateQueue.filter(
      (existing) => existing.path !== update.path
    );
  }

  updateQueue.push(update);

  if (updateQueue.length > maxSize) {
    flushUpdates();
    return true;
  }

  scheduleFlush(config);
  return false;
}

function scheduleFlush(config: BatchingConfig) {
  if (flushTimeoutId !== undefined) {
    clearTimeout(flushTimeoutId);
  }

  const delay = (config as any).autoFlushDelay ?? config.debounceMs ?? 16;
  flushTimeoutId = setTimeout(() => {
    flushUpdates();
  }, delay) as unknown as number;
}

function flushUpdates(): void {
  if (isUpdating) return;

  let queue: Array<BatchedUpdate>;
  do {
    if (updateQueue.length === 0) return;

    isUpdating = true;
    queue = updateQueue;
    updateQueue = [];

    if (flushTimeoutId !== undefined) {
      clearTimeout(flushTimeoutId);
      flushTimeoutId = undefined;
    }

    queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    try {
      queue.forEach(({ fn }) => fn());
    } finally {
      isUpdating = false;
    }
  } while (updateQueue.length > 0);
}

function batchUpdates(fn: () => void, path?: string): void {
  const startTime = performance.now();
  const depth = path ? parsePath(path).length : 0;

  const update: BatchedUpdate = { fn, startTime, depth, path };

  const wasFlushed = addToQueue(update, currentBatchingConfig);

  if (!wasFlushed) {
    const isTimedOut =
      (currentBatchingConfig as any).batchTimeoutMs &&
      updateQueue.length > 0 &&
      startTime - updateQueue[0].startTime >=
        (currentBatchingConfig as any).batchTimeoutMs;

    if (isTimedOut) {
      flushUpdates();
    } else if (!isUpdating && updateQueue.length > 0) {
      queueMicrotask(() => {
        flushUpdates();
      });
    }
  }
}

export function withBatchingWithConfig<T>(
  config: BatchingConfig = {}
): Enhancer<BatchingMethods<T>> {
  const enabled = (config as any).enabled ?? true;

  // Only update the global batching configuration when batching is enabled
  // for this enhancer instance. Leaving global config untouched when disabled
  // prevents accidental cross-test interference.
  if (enabled) {
    currentBatchingConfig = { ...currentBatchingConfig, ...config };
  }

  const enhancer = <Tree extends SignalTree<T>>(
    tree: Tree
  ): Tree & BatchingMethods<T> => {
    if (!enabled) {
      // Provide explicit pass-through methods so consumers can always call
      // `tree.batchUpdate(...)` even when batching is disabled. This avoids
      // relying on the base `signalTree` implementation shape and keeps
      // behavior stable across versions.
      const enhanced = tree as unknown as SignalTree<T> &
        BatchingMethods<T> & {
          batch?: (updater: (state: TreeNode<T>) => void) => void;
        };

      enhanced.batch = (updater: (state: TreeNode<T>) => void) => {
        try {
          // Delegate to the tree's built-in batchUpdate which applies updates
          // immediately in the default (non-batching) case.
          (tree as any).batchUpdate(updater as any);
        } catch {
          try {
            updater(enhanced.state as unknown as TreeNode<T>);
          } catch {
            // ignore
          }
        }
      };
      // No-op: keep default immediate behavior but expose `batch`/`batchUpdate`.
      // Ensure `batchUpdate` exists and delegates to the tree's default
      // immediate-update implementation so callers can always call
      // `tree.batchUpdate(...)` and get the non-batching behavior.
      (enhanced as any).batchUpdate = (updater: (current: T) => Partial<T>) => {
        try {
          const current = tree() as T;
          const updates = updater(current as T);

          applyState(enhanced.state as unknown as TreeNode<T>, updates as T);
        } catch (err) {
          try {
            (tree as any).batchUpdate(updater as any);
          } catch {
            // ignore
          }
        }
      };

      return enhanced as unknown as Tree & BatchingMethods<T>;
    }

    const originalTreeCall = tree.bind(tree);

    const enhancedTree = function (
      this: SignalTree<T>,
      ...args: unknown[]
    ): T | void {
      if (args.length === 0) {
        return originalTreeCall();
      } else {
        batchUpdates(() => {
          if (args.length === 1) {
            const arg = args[0];
            if (typeof arg === 'function') {
              originalTreeCall(arg as (current: T) => T);
            } else {
              originalTreeCall(arg as T);
            }
          }
        });
      }
    } as unknown as SignalTree<T>;

    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    Object.assign(enhancedTree, tree);

    if ('state' in tree) {
      Object.defineProperty(enhancedTree, 'state', {
        value: tree.state,
        enumerable: false,
        configurable: true,
      });
    }

    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: (tree as SignalTree<T>).$,
        enumerable: false,
        configurable: true,
      });
    }

    (enhancedTree as any).batchUpdate = (
      updater: (current: T) => Partial<T>
    ) => {
      batchUpdates(() => {
        const current = originalTreeCall();
        const updates = updater(current);

        Object.entries(updates).forEach(([key, value]) => {
          const property = (enhancedTree.state as unknown as TreeNode<T>)[
            key as keyof T
          ];
          if (property && 'set' in (property as object)) {
            (property as { set: (value: unknown) => void }).set(value);
          } else if (isNodeAccessor(property)) {
            (property as (value: unknown) => void)(value);
          }
        });
      });
    };

    return enhancedTree as unknown as Tree & BatchingMethods<T>;
  };

  return enhancer as unknown as Enhancer<BatchingMethods<T>>;
}

/** User-friendly no-arg signature expected by type-level tests */
export function withBatching(
  config: BatchingConfig = {}
): <Tree extends SignalTree<any>>(tree: Tree) => Tree & BatchingMethods<any> {
  return withBatchingWithConfig(config) as unknown as <
    Tree extends SignalTree<any>
  >(
    tree: Tree
  ) => Tree & BatchingMethods<any>;
}

export function withHighPerformanceBatching<T>() {
  return withBatchingWithConfig<T>({
    enabled: true,
    maxBatchSize: 200,
    debounceMs: 0,
  } as unknown as BatchingConfig);
}

export function flushBatchedUpdates(): void {
  if (updateQueue.length > 0) {
    const queue = updateQueue.slice();
    updateQueue = [];
    isUpdating = false;

    queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    queue.forEach(({ fn }) => {
      fn();
    });
  }
}

export function hasPendingUpdates(): boolean {
  return updateQueue.length > 0;
}

export function getBatchQueueSize(): number {
  return updateQueue.length;
}
