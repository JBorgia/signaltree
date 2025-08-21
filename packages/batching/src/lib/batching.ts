import { parsePath } from '@signaltree/core';
import type { SignalTree, DeepSignalify } from '@signaltree/core';

/**
 * Configuration options for intelligent batching behavior.
 * Controls how updates are grouped and processed for optimal performance.
 * Uses unconstrained recursive typing - no limitations on T
 *
 * @example
 * ```typescript
 * const config: BatchingConfig = {
 *   enabled: true,
 *   maxBatchSize: 50,
 *   autoFlushDelay: 16, // 60fps
 *   batchTimeoutMs: 100
 * };
 * ```
 */
interface BatchingConfig {
  /** Whether batching is enabled (default: true) */
  enabled?: boolean;
  /** Maximum number of updates per batch (default: 100) */
  maxBatchSize?: number;
  /** Delay before auto-flushing batch in milliseconds (default: 16) */
  autoFlushDelay?: number;
  /** Maximum time to wait before forcing batch flush (default: 100) */
  batchTimeoutMs?: number;
}

/**
 * Enhanced SignalTree interface with intelligent batching capabilities.
 * Provides high-performance batch update methods that group multiple state changes.
 *
 * @template T - The state object type extending StateObject
 *
 * @example
 * ```typescript
 * interface AppState {
 *   users: User[];
 *   ui: { loading: boolean; error: string | null };
 *   stats: { total: number; active: number };
 * }
 *
 * const tree: BatchingSignalTree<AppState> = create(initialState)
 *   .with(withBatching());
 *
 * // Batch multiple related updates
 * tree.batchUpdate((state) => ({
 *   users: [...state.users, newUser],
 *   ui: { ...state.ui, loading: false },
 *   stats: {
 *     total: state.users.length + 1,
 *     active: state.users.filter(u => u.active).length + (newUser.active ? 1 : 0)
 *   }
 * }));
 * Uses unconstrained recursive typing - no limitations on T
 * ```
 */
interface BatchingSignalTree<T> extends SignalTree<T> {
  /**
   * Batches multiple state updates into a single change cycle for optimal performance.
   * Groups related updates to prevent UI thrashing and improve rendering efficiency.
   *
   * @param updater - Function that receives current state and returns partial update
   *
   * @example
   * ```typescript
   * // Instead of multiple individual updates
   * tree.$.update(() => ({ loading: true }));
   * tree.$.update(() => ({ error: null }));
   * tree.$.update(() => ({ users: [] }));
   *
   * // Use a single batched update
   * tree.batchUpdate((state) => ({
   *   loading: true,
   *   error: null,
   *   users: []
   * }));
   * ```
   */
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

/**
 * Represents a queued update in the batching system.
 * Contains timing and hierarchy information for optimal batch processing.
 */
interface BatchedUpdate {
  /** The update function to execute */
  fn: () => void;
  /** Timestamp when the update was queued (for timeout handling) */
  startTime: number;
  /** Nesting depth for optimal execution order (optional) */
  depth?: number;
  /** State path for update grouping and optimization (optional) */
  path?: string;
}

/** Global queue for batched updates awaiting processing */
let updateQueue: Array<BatchedUpdate> = [];
/** Flag to prevent recursive batch processing */
let isUpdating = false;
/** Timeout ID for scheduled flush operations */
let flushTimeoutId: number | undefined;
/** Current batching configuration */
const currentBatchingConfig: BatchingConfig = {};

/** Last active per-instance batching manager (used by exported helpers in tests) */
let lastBatchingManager: {
  flush: () => void;
  getSize: () => number;
  hasPending: () => boolean;
} | null = null;

/**
 * Enhanced queue management with priority and deduplication
 * Returns true if queue was flushed immediately, false if scheduled for later
 */
function addToQueue(
  update: BatchedUpdate,
  config: BatchingConfig = currentBatchingConfig
): boolean {
  const maxSize = config.maxBatchSize ?? 100;

  // Remove duplicates based on path if available
  if (update.path) {
    updateQueue = updateQueue.filter(
      (existing) => existing.path !== update.path
    );
  }

  updateQueue.push(update);

  // Check if we should flush immediately due to maxBatchSize
  // Flush when we exceed maxBatchSize, not when we reach it
  if (updateQueue.length > maxSize) {
    // Flush immediately when max batch size is exceeded
    flushUpdates();
    return true; // Indicate that queue was flushed
  }

  // Schedule auto-flush if not already scheduled
  scheduleFlush(config);
  return false; // Indicate that queue was scheduled for later
}

/**
 * Schedules automatic queue flushing with configurable timing
 */
function scheduleFlush(config: BatchingConfig) {
  if (flushTimeoutId !== undefined) {
    clearTimeout(flushTimeoutId);
  }

  const delay = config.autoFlushDelay ?? 16; // Default to 60fps
  flushTimeoutId = setTimeout(() => {
    flushUpdates();
  }, delay) as unknown as number;
}

/**
 * Processes the update queue immediately with race condition protection.
 * Handles updates that arrive during flush execution.
 */
function flushUpdates(): void {
  if (isUpdating) return;

  let queue: Array<BatchedUpdate>;
  do {
    if (updateQueue.length === 0) return;

    isUpdating = true;
    queue = updateQueue;
    updateQueue = []; // Clear queue atomically

    // Clear any pending flush timeout
    if (flushTimeoutId !== undefined) {
      clearTimeout(flushTimeoutId);
      flushTimeoutId = undefined;
    }

    // Sort by depth (deepest first) for optimal update propagation
    queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    try {
      queue.forEach(({ fn }) => fn());
    } finally {
      isUpdating = false;
    }

    // Process any updates that were added during flush
  } while (updateQueue.length > 0);
}

/**
 * Core batching function that intelligently queues updates and processes them in optimized microtasks.
 * Updates are sorted by depth (deepest first) for optimal update propagation and minimal re-computations.
 *
 * @param fn - The update function to batch
 * @param path - Optional state path for update grouping and optimization
 *
 * @example
 * ```typescript
 * // Simple batched update
 * batchUpdates(() => tree.$.update(() => ({ count: 1 })));
 *
 * // Path-aware batching for nested updates
 * batchUpdates(() => tree.$.update(() => ({ user: { name: 'John' } })), 'user.name');
 *
 * // Multiple updates get automatically batched
 * batchUpdates(() => tree.$.update(() => ({ loading: true })));
 * batchUpdates(() => tree.$.update(() => ({ error: null })));
 * // Both execute in single microtask
 * ```
 */
export function batchUpdates(fn: () => void, path?: string): void {
  const startTime = performance.now();
  const depth = path ? parsePath(path).length : 0;

  const update: BatchedUpdate = { fn, startTime, depth, path };

  // Use enhanced queue management
  const wasFlushed = addToQueue(update, currentBatchingConfig);

  // Only schedule additional flush if queue wasn't already flushed
  if (!wasFlushed) {
    // Check if we need to process immediately due to timeout
    const isTimedOut =
      currentBatchingConfig.batchTimeoutMs &&
      updateQueue.length > 0 &&
      startTime - updateQueue[0].startTime >=
        currentBatchingConfig.batchTimeoutMs;

    if (isTimedOut) {
      flushUpdates();
    } else if (!isUpdating && updateQueue.length > 0) {
      // Schedule flush but don't set isUpdating until the microtask runs
      queueMicrotask(() => {
        flushUpdates();
      });
    }
  }
}

/**
 * Enhances a SignalTree with intelligent batching capabilities for optimal performance.
 * Automatically groups rapid state updates into efficient batch cycles to eliminate UI thrashing.
 *
 * @template T - The state object type extending StateObject
 * @param config - Configuration options for batching behavior
 * @returns Function that enhances a SignalTree with batching capabilities
 *
 * @example
 * ```typescript
 * // Basic batching with default settings
 * const tree = create(initialState).with(withBatching());
 *
 * // High-performance batching for demanding applications
 * const tree = create(initialState).with(withBatching({
 *   maxBatchSize: 50,
 *   autoFlushDelay: 8, // ~120fps
 *   batchTimeoutMs: 50
 * }));
 *
 * // Conservative batching for stable UIs
 * const tree = create(initialState).with(withBatching({
 *   maxBatchSize: 10,
 *   autoFlushDelay: 100,
 *   batchTimeoutMs: 200
 * }));
 *
 * // Use batching methods
 * tree.batchUpdate((state) => ({
 *   users: [...state.users, newUser],
 *   loading: false,
 *   error: null
 * }));
 * Uses unconstrained recursive typing - no limitations on T
 * ```
 */
export function withBatching<T>(
  config: BatchingConfig = {}
): (tree: SignalTree<T>) => BatchingSignalTree<T> {
  const { enabled = true } = config;
  return (tree: SignalTree<T>): BatchingSignalTree<T> => {
    // withBatching invoked
    if (!enabled) {
      return tree as BatchingSignalTree<T>;
    }
    // Per-instance batching state to avoid cross-tree interference
    const instanceConfig: BatchingConfig = { ...config };
    let instanceQueue: Array<BatchedUpdate> = [];
    let instanceIsUpdating = false;
    let instanceFlushTimeoutId: number | undefined;

    const originalUpdate = tree.$.update.bind(tree.$);

    function instanceScheduleFlush() {
      // Prefer microtask scheduling so awaiting queueMicrotask in tests works
      if (instanceFlushTimeoutId !== undefined) {
        clearTimeout(instanceFlushTimeoutId);
        instanceFlushTimeoutId = undefined;
      }
      // Schedule a fallback timeout flush (do not use microtasks here to keep
      // imperative updates batched until explicitly requested)
      // schedule fallback timeout flush
      const delay = instanceConfig.autoFlushDelay ?? 16;
      instanceFlushTimeoutId = setTimeout(() => {
        instanceFlushTimeoutId = undefined;
        instanceFlushUpdates();
      }, delay) as unknown as number;
    }

    function instanceFlushUpdates(): void {
      if (instanceIsUpdating) return;
      let q: Array<BatchedUpdate>;
      do {
        if (instanceQueue.length === 0) return;
        // executing instance flush
        instanceIsUpdating = true;
        q = instanceQueue;
        instanceQueue = [];
        if (instanceFlushTimeoutId !== undefined) {
          clearTimeout(instanceFlushTimeoutId);
          instanceFlushTimeoutId = undefined;
        }
        q.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
        try {
          q.forEach(({ fn }) => fn());
        } finally {
          instanceIsUpdating = false;
        }
      } while (instanceQueue.length > 0);
    }

    function instanceAddToQueue(
      update: BatchedUpdate,
      scheduleMicrotask = false
    ): boolean {
      const maxSize = instanceConfig.maxBatchSize ?? 100;

      if (update.path) {
        instanceQueue = instanceQueue.filter(
          (existing) => existing.path !== update.path
        );
      }

      instanceQueue.push(update);

      if (instanceQueue.length > maxSize) {
        instanceFlushUpdates();
        return true;
      }

      // Optionally schedule microtask flush (used by batchUpdate)
      if (scheduleMicrotask) {
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(() => instanceFlushUpdates());
        } else {
          Promise.resolve().then(() => instanceFlushUpdates());
        }
        // also schedule fallback timeout in case microtasks aren't available
        instanceScheduleFlush();
      }
      return false;
    }

    // Override update and batchUpdate to use per-instance queue
    tree.$.update = (updater: (current: T) => Partial<T>) => {
      // Regular imperative updates should only be queued. Flushing is handled
      // by maxBatchSize, batchUpdate (microtask), or manual flush.
      instanceAddToQueue(
        {
          fn: () => originalUpdate(updater),
          startTime: performance.now(),
          depth: 0,
        },
        false
      );
    };

    // Create an enhanced wrapper around the callable state proxy so we can
    // intercept `.update` accesses. The original callable proxy always returned
    // its own update implementation from the `get` trap, so assigning
    // `tree.$.update = ...` didn't override it. Wrapping preserves all other
    // behavior while ensuring `.update` routes through our batching queue.
    // Keep original callable proxy/state
    type CallableState = DeepSignalify<T> & {
      apply?: (...args: unknown[]) => unknown;
    };
    const originalState = tree.$ as unknown as CallableState;

    const callableWrapper = function thisCallable(
      this: unknown,
      ...args: unknown[]
    ) {
      return originalState.apply
        ? originalState.apply(this, args)
        : (originalState as unknown as () => unknown)();
    };

    const stateProxy = new Proxy(callableWrapper, {
      apply(_target, thisArg, argArray: unknown[]) {
        return originalState.apply
          ? originalState.apply(thisArg, argArray)
          : (originalState as unknown as () => unknown)();
      },
      get(_target, prop, receiver) {
        if (prop === 'update') {
          return (updater: (current: T) => Partial<T>) => {
            instanceAddToQueue(
              {
                fn: () => originalUpdate(updater),
                startTime: performance.now(),
                depth: 0,
              },
              false // imperative updates should only queue
            );
          };
        }
        // Delegate everything else to the original state proxy
        const val = Reflect.get(originalState, prop, receiver);
        return typeof val === 'function' ? val.bind(originalState) : val;
      },
      has(_target, prop) {
        return prop in originalState;
      },
      ownKeys() {
        return Reflect.ownKeys(originalState);
      },
      getOwnPropertyDescriptor(_target, prop) {
        return Reflect.getOwnPropertyDescriptor(
          originalState,
          prop as PropertyKey
        );
      },
      set(_target, prop, value) {
        return Reflect.set(originalState as object, prop as PropertyKey, value);
      },
    }) as unknown as DeepSignalify<T>;

    const enhancedTree = tree as BatchingSignalTree<T>;
    // Replace the tree's state and $ references with our proxy wrapper
    enhancedTree.state = stateProxy as unknown as DeepSignalify<T>;
    enhancedTree.$ = stateProxy as unknown as DeepSignalify<T>;

    enhancedTree.batchUpdate = (updater: (current: T) => Partial<T>) => {
      instanceAddToQueue(
        {
          fn: () => originalUpdate(updater),
          startTime: performance.now(),
          depth: 0,
        },
        true // batchUpdate should schedule microtask flush
      );
    };

    // Register this instance as the last active manager so exported helpers work in tests
    lastBatchingManager = {
      flush: instanceFlushUpdates,
      getSize: () => instanceQueue.length,
      hasPending: () => instanceQueue.length > 0,
    };

    return enhancedTree;
  };
}

/**
 * Convenience function to enable batching with default settings.
 * Equivalent to withBatching({ enabled: true }) but more concise for common usage.
 *
 * @template T - The state object type extending StateObject
 * @returns Function that enhances a SignalTree with default batching settings
 *
 * @example
 * ```typescript
 * // Simple batching enablement
 * const tree = create(initialState).with(enableBatching());
 *
 * // Equivalent to:
 * const tree = create(initialState).with(withBatching({ enabled: true }));
 * Uses unconstrained recursive typing - no limitations on T
 * ```
 */
export function enableBatching<T>() {
  return withBatching<T>({ enabled: true });
}

/**
 * Creates high-performance batching configuration optimized for demanding applications.
 * Uses aggressive batching settings for maximum performance in high-frequency update scenarios.
 * Uses unconstrained recursive typing - no limitations on T
 *
 * @template T - The state object type extending StateObject
 * @returns Function that enhances a SignalTree with high-performance batching
 *
 * @example
 * ```typescript
 * // For performance-critical applications
 * const gameTree = create(gameState).with(withHighPerformanceBatching());
 *
 * // Perfect for:
 * // - Real-time games
 * // - High-frequency data updates
 * // - Animation-heavy UIs
 * // - Large dataset operations
 *
 * // Automatically includes:
 * // - Large batch sizes (200 updates)
 * // - Immediate processing (0ms timeout)
 * // - Aggressive optimization
 * Uses unconstrained recursive typing - no limitations on T
 * ```
 */
export function withHighPerformanceBatching<T>() {
  return withBatching<T>({
    enabled: true,
    maxBatchSize: 200,
    batchTimeoutMs: 0,
  });
}

/**
 * Manually flushes all pending batched updates immediately.
 * Forces synchronous execution of queued updates, bypassing normal batching delays.
 * Useful for testing scenarios or when immediate state consistency is required.
 *
 * @example
 * ```typescript
 * // Queue some updates
 * tree.batchUpdate(() => ({ count: 1 }));
 * tree.batchUpdate(() => ({ name: 'test' }));
 *
 * // In tests, ensure updates are applied immediately
 * flushBatchedUpdates();
 * expect(tree.$().count).toBe(1);
 * expect(tree.$().name).toBe('test');
 *
 * // Before critical operations that need current state
 * flushBatchedUpdates();
 * const currentState = tree.$(); // Guaranteed to be up-to-date
 *
 * // In animation frames for precise timing
 * requestAnimationFrame(() => {
 *   flushBatchedUpdates(); // Ensure updates are applied before render
 *   updateUI();
 * });
 * ```
 */
export function flushBatchedUpdates(): void {
  // If an instance-level batching manager exists (created by withBatching), prefer it
  if (lastBatchingManager) {
    lastBatchingManager.flush();
    return;
  }

  // Fallback to module-level/global queue behavior for older code/tests
  // global flush invoked
  if (updateQueue.length > 0) {
    // Force flush regardless of isUpdating state
    const queue = updateQueue.slice();
    updateQueue = [];
    isUpdating = false; // Reset the updating flag
    // Flushing queued updates

    // Sort by depth (deepest first) for optimal update propagation
    queue.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    queue.forEach(({ fn }) => fn());
  } else {
    // nothing to flush
  }
}

/**
 * Checks if there are pending batched updates waiting to be processed.
 * Useful for testing, debugging, or conditional logic based on update queue state.
 *
 * @returns True if updates are queued, false if queue is empty
 *
 * @example
 * ```typescript
 * // Check before critical operations
 * tree.batchUpdate(() => ({ loading: true }));
 *
 * if (hasPendingUpdates()) {
 *   console.log('Updates are queued for processing');
 *   flushBatchedUpdates(); // Process them now if needed
 * }
 *
 * // In testing
 * tree.batchUpdate(() => ({ count: 1 }));
 * expect(hasPendingUpdates()).toBe(true);
 *
 * flushBatchedUpdates();
 * expect(hasPendingUpdates()).toBe(false);
 *
 * // Conditional behavior
 * function performCriticalOperation() {
 *   if (hasPendingUpdates()) {
 *     flushBatchedUpdates(); // Ensure consistent state
 *   }
 *   // Proceed with operation
 * }
 * ```
 */
export function hasPendingUpdates(): boolean {
  if (lastBatchingManager) return lastBatchingManager.hasPending();
  return updateQueue.length > 0;
}

/**
 * Gets the current number of updates waiting in the batch queue.
 * Useful for performance monitoring, debugging, and batch size optimization.
 *
 * @returns Number of queued updates
 *
 * @example
 * ```typescript
 * // Performance monitoring
 * function monitorBatchPerformance() {
 *   const queueSize = getBatchQueueSize();
 *
 *   if (queueSize > 50) {
 *     console.warn(`Large batch queue detected: ${queueSize} updates`);
 *   }
 *
 *   // Log metrics
 *   console.log(`Current queue size: ${queueSize}`);
 * }
 *
 * // Debug batching behavior
 * tree.batchUpdate(() => ({ a: 1 }));
 * tree.batchUpdate(() => ({ b: 2 }));
 * tree.batchUpdate(() => ({ c: 3 }));
 *
 * console.log(`Queue size: ${getBatchQueueSize()}`); // 3
 *
 * flushBatchedUpdates();
 * console.log(`Queue size after flush: ${getBatchQueueSize()}`); // 0
 *
 * // Optimize batch configuration
 * const currentQueueSize = getBatchQueueSize();
 * if (currentQueueSize > 100) {
 *   // Consider reducing maxBatchSize or autoFlushDelay
 *   console.log('Consider optimizing batch configuration');
 * }
 * ```
 */
export function getBatchQueueSize(): number {
  if (lastBatchingManager) return lastBatchingManager.getSize();
  return updateQueue.length;
}
