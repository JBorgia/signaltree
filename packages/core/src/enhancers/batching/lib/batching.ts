import { parsePath } from '@signaltree/shared';

import { isNodeAccessor } from '../../../lib/utils';

import type { SignalTreeBase as SignalTree } from '../../../lib/types';

/**
 * Configuration options for intelligent batching behavior.
 */
interface BatchingConfig {
  enabled?: boolean;
  maxBatchSize?: number;
  autoFlushDelay?: number;
  batchTimeoutMs?: number;
}

/** Enhanced SignalTree interface with batching method */
interface BatchingSignalTree<T> extends SignalTree<T> {
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

/** Public methods surface added by the batching enhancer */
export type BatchingMethods<T> = {
  batchUpdate(updater: (current: T) => Partial<T>): void;
};

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

  const delay = config.autoFlushDelay ?? 16;
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
      currentBatchingConfig.batchTimeoutMs &&
      updateQueue.length > 0 &&
      startTime - updateQueue[0].startTime >=
        currentBatchingConfig.batchTimeoutMs;

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
): (tree: SignalTree<T>) => BatchingSignalTree<T> {
  const { enabled = true } = config;

  currentBatchingConfig = { ...currentBatchingConfig, ...config };

  return (tree: SignalTree<T>): BatchingSignalTree<T> => {
    if (!enabled) {
      return tree as BatchingSignalTree<T>;
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
        value: (tree as unknown as Record<string, unknown>)['$'],
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
          const property = (
            enhancedTree.state as unknown as Record<string, unknown>
          )[key];
          if (property && 'set' in (property as object)) {
            (property as { set: (value: unknown) => void }).set(value);
          } else if (isNodeAccessor(property)) {
            (property as (value: unknown) => void)(value);
          }
        });
      });
    };

    return enhancedTree as unknown as BatchingSignalTree<T>;
  };
}

/** User-friendly no-arg signature expected by type-level tests */
export function withBatching<T = any>(): <S>(
  tree: SignalTree<S>
) => SignalTree<S> & BatchingMethods<T> {
  const enhancer = withBatchingWithConfig<T>({});
  return <S>(tree: SignalTree<S>) =>
    enhancer(tree as unknown as SignalTree<T>) as unknown as SignalTree<S> &
      BatchingMethods<T>;
}

export function withHighPerformanceBatching<T>() {
  return withBatchingWithConfig<T>({
    enabled: true,
    maxBatchSize: 200,
    batchTimeoutMs: 0,
  });
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
