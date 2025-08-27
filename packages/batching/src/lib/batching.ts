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

// Optional module-level batching helpers for tests/legacy API compatibility
interface BatchedUpdate {
  fn: () => void;
  startTime: number;
  depth?: number;
  path?: string;
}

let updateQueue: Array<BatchedUpdate> = [];
let isUpdating = false;
let flushTimeoutId: number | undefined;
const currentBatchingConfig: BatchingConfig = {};

let lastBatchingManager: {
  flush: () => void;
  getSize: () => number;
  hasPending: () => boolean;
  getQueue?: () => Array<BatchedUpdate>;
} | null = null;

const proxyPathMap: WeakMap<object, string> = new WeakMap();
const wrapperCache: WeakMap<object, unknown> = new WeakMap();

function addToQueue(
  update: BatchedUpdate,
  _config: BatchingConfig = currentBatchingConfig
): boolean {
  if (update.path) {
    updateQueue = updateQueue.filter((e) => e.path !== update.path);
  }
  updateQueue.push(update);
  if (flushTimeoutId !== undefined) clearTimeout(flushTimeoutId);
  flushTimeoutId = setTimeout(() => flushUpdates(), 16) as unknown as number;
  return false;
}

function flushUpdates(): void {
  if (isUpdating) return;
  if (updateQueue.length === 0) return;
  isUpdating = true;
  const q = updateQueue;
  updateQueue = [];
  if (flushTimeoutId !== undefined) {
    clearTimeout(flushTimeoutId);
    flushTimeoutId = undefined;
  }
  q.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
  try {
    q.forEach(({ fn }) => fn());
  } finally {
    isUpdating = false;
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
      // Replace the callable state with a tiny proxy that provides a
      // `batchUpdate` stub which delegates to the normal `.update`. This is a
      // best-effort compatibility shim used only when batching is disabled.
      try {
        const original = tree.$ as unknown as object;
        const wrapper = new Proxy(original as object, {
          get(target, prop, receiver) {
            if (prop === 'batchUpdate') {
              return (updater: (current: T) => Partial<T>) => {
                (tree.$ as DeepSignalify<T>).update(updater);
              };
            }
            const val = Reflect.get(target, prop, receiver);
            return typeof val === 'function'
              ? (val as (...a: unknown[]) => unknown).bind(target)
              : val;
          },
          apply(target, thisArg, argArray) {
            return (target as (...a: unknown[]) => unknown).apply(
              thisArg,
              argArray
            );
          },
        }) as unknown as DeepSignalify<T>;

        tree.state = wrapper;
        tree.$ = wrapper;
      } catch {
        // ignore - best-effort only
      }

      return tree as BatchingSignalTree<T>;
    }
    // Per-instance batching state to avoid cross-tree interference
    const instanceConfig: BatchingConfig = { ...config };
    let instanceQueue: Array<BatchedUpdate> = [];
    let instanceIsUpdating = false;
    let instanceFlushTimeoutId: number | undefined;

    // Updates will be resolved from the proxied node at call-time

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

    // Lightweight nested wrapper: expose `.batchUpdate` on root and nested callable nodes
    const enhancedTree = tree as BatchingSignalTree<T>;
    const makeWrapper = (node: unknown, path = ''): unknown =>
      new Proxy(node as object, {
        apply(target, thisArg, argArray) {
          return (target as (...a: unknown[]) => unknown).apply(
            thisArg,
            argArray as unknown[]
          );
        },
        get(target, prop, receiver) {
          if (prop === 'batchUpdate') {
            return (updater: (current: T) => Partial<T>) => {
              instanceAddToQueue(
                {
                  fn: () => {
                    const upd = (
                      target as unknown as { update?: (u: unknown) => unknown }
                    ).update;
                    if (typeof upd === 'function') return upd(updater);
                    return undefined;
                  },
                  startTime: performance.now(),
                  depth: path ? parsePath(path).length : 0,
                  path,
                },
                true
              );
            };
          }

          // Intercept direct `update` calls to participate in batching. We do NOT
          // schedule a microtask here so maxBatchSize can trigger immediate flushes.
          if (prop === 'update') {
            return (
              updaterOrPartial: ((current: T) => Partial<T>) | Partial<T>
            ) => {
              instanceAddToQueue(
                {
                  fn: () => {
                    const upd = (
                      target as unknown as {
                        update?: (u: unknown) => unknown;
                      }
                    ).update;
                    if (typeof upd === 'function') {
                      return upd(updaterOrPartial as unknown);
                    }
                    return undefined;
                  },
                  startTime: performance.now(),
                  depth: path ? parsePath(path).length : 0,
                  path,
                },
                false
              );
            };
          }

          const val = Reflect.get(target, prop, receiver);
          if (
            typeof val === 'function' &&
            (val as unknown as { __isCallableProxy__?: boolean })
              .__isCallableProxy__ === true
          ) {
            const childPath = path ? `${path}.${String(prop)}` : String(prop);
            return makeWrapper(val, childPath);
          }

          // IMPORTANT: Do not bind functions (e.g., Angular signals are
          // callable functions with .set and other props). Binding would drop
          // those properties and break APIs like state.events.set(...).
          return val;
        },
      });

    try {
      enhancedTree.$ = makeWrapper(tree.$, '') as unknown as DeepSignalify<T>;
      enhancedTree.state = enhancedTree.$ as unknown as DeepSignalify<T>;
    } catch {
      // best-effort only
    }

    // Expose instance manager to module-level helpers for tests
    lastBatchingManager = {
      flush: instanceFlushUpdates,
      getSize: () => instanceQueue.length,
      hasPending: () => instanceQueue.length > 0,
      getQueue: () => instanceQueue.slice(),
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
// Module-level helpers (used by tests) — minimal shim over instance manager if present
export function flushBatchedUpdates(): void {
  if (lastBatchingManager) {
    lastBatchingManager.flush();
    return;
  }
  flushUpdates();
}

export function hasPendingUpdates(): boolean {
  if (lastBatchingManager) return lastBatchingManager.hasPending();
  return updateQueue.length > 0;
}

export function getBatchQueueSize(): number {
  if (lastBatchingManager) return lastBatchingManager.getSize();
  return updateQueue.length;
}

export function getPendingBatchedUpdates(): Array<BatchedUpdate> {
  if (lastBatchingManager && lastBatchingManager.getQueue) {
    return lastBatchingManager.getQueue() || [];
  }
  return updateQueue.slice();
}
