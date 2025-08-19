/**
 * SignalTree Core v1.1.6 - MIT License
 * Copyright (c) 2025 Jonathan D Borgia
 * @see https://github.com/JBorgia/signaltree/blob/main/LICENSE
 */

import {
  signal,
  WritableSignal,
  Signal,
  computed,
  effect,
  inject,
  DestroyRef,
  DestroyRefToken,
  isSignal,
} from './adapter';
import { scheduleTask, untracked } from './scheduler';
import {
  registerTree,
  unregisterTree,
  snapshotTree,
  snapshot,
} from './devtools';
import type {
  SignalTree,
  DeepSignalify,
  TreeConfig,
  TreePreset,
  Middleware,
  PerformanceMetrics,
  EntityHelpers,
} from './types';
import { createLazySignalTree, equal } from './utils';
import { createTimeTravelFeature } from './internal/time-travel';

// ============================================
// PERFORMANCE HEURISTICS
// ============================================

/**
 * Estimates the size of an object for strategy selection
 */
function estimateObjectSize(
  obj: unknown,
  maxDepth = 3,
  currentDepth = 0
): number {
  if (currentDepth >= maxDepth) return 1;
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== 'object') return 1;

  let size = 0;

  try {
    if (Array.isArray(obj)) {
      size = obj.length;
      // Sample first few items for nested size estimation
      const sampleSize = Math.min(3, obj.length);
      for (let i = 0; i < sampleSize; i++) {
        size += estimateObjectSize(obj[i], maxDepth, currentDepth + 1) * 0.1;
      }
    } else {
      const keys = Object.keys(obj);
      size = keys.length;
      // Sample first few properties for nested size estimation
      const sampleSize = Math.min(5, keys.length);
      for (let i = 0; i < sampleSize; i++) {
        const value = (obj as Record<string, unknown>)[keys[i]];
        size += estimateObjectSize(value, maxDepth, currentDepth + 1) * 0.5;
      }
    }
  } catch {
    // If we can't estimate, assume small
    return 1;
  }

  return Math.floor(size);
}

/**
 * Determines whether to use lazy signal creation based on object characteristics
 */
function shouldUseLazy(obj: unknown, config: TreeConfig): boolean {
  // Explicit configuration takes precedence
  if (config.useLazySignals !== undefined) {
    return config.useLazySignals;
  }

  // Development mode: prefer eager for better debugging
  if (config.debugMode || config.enableDevTools) {
    return false;
  }

  // Performance mode: always use lazy
  if (config.batchUpdates && config.useMemoization) {
    return true;
  }

  // Auto-detect based on size
  const estimatedSize = estimateObjectSize(obj);

  // Use lazy for objects with more than 50 estimated properties
  return estimatedSize > 50;
}

/**
 * Creates an equality function based on configuration.
 *
 * @param useShallowComparison - If true, uses Object.is for comparison; otherwise uses deep equality
 * @returns A function that compares two values for equality
 */
function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

/**
 * Enhanced built-in object detection with comprehensive coverage
 */
function isBuiltInObject(v: unknown): boolean {
  if (v === null || v === undefined) return false;

  // Core JavaScript built-ins
  if (
    v instanceof Date ||
    v instanceof RegExp ||
    typeof v === 'function' ||
    v instanceof Map ||
    v instanceof Set ||
    v instanceof WeakMap ||
    v instanceof WeakSet ||
    v instanceof ArrayBuffer ||
    v instanceof DataView ||
    v instanceof Error ||
    v instanceof Promise
  ) {
    return true;
  }

  // Typed Arrays
  if (
    v instanceof Int8Array ||
    v instanceof Uint8Array ||
    v instanceof Uint8ClampedArray ||
    v instanceof Int16Array ||
    v instanceof Uint16Array ||
    v instanceof Int32Array ||
    v instanceof Uint32Array ||
    v instanceof Float32Array ||
    v instanceof Float64Array ||
    v instanceof BigInt64Array ||
    v instanceof BigUint64Array
  ) {
    return true;
  }

  // Web APIs (when available)
  if (typeof window !== 'undefined') {
    if (
      v instanceof URL ||
      v instanceof URLSearchParams ||
      v instanceof FormData ||
      v instanceof Blob ||
      (typeof File !== 'undefined' && v instanceof File) ||
      (typeof FileList !== 'undefined' && v instanceof FileList) ||
      (typeof Headers !== 'undefined' && v instanceof Headers) ||
      (typeof Request !== 'undefined' && v instanceof Request) ||
      (typeof Response !== 'undefined' && v instanceof Response) ||
      (typeof AbortController !== 'undefined' &&
        v instanceof AbortController) ||
      (typeof AbortSignal !== 'undefined' && v instanceof AbortSignal)
    ) {
      return true;
    }
  }

  // Node.js built-ins (when available)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NodeBuffer = (globalThis as any)?.Buffer;
    if (NodeBuffer && v instanceof NodeBuffer) {
      return true;
    }
  } catch {
    // Ignore if Buffer is not available
  }

  return false;
}

/**
 * Core function to create a basic SignalTree with enhanced safety and smart strategy selection.
 * This provides the minimal functionality without advanced features.
 *
 * @template T - The state object type (NO constraints - maximum flexibility)
 * @param obj - The initial state object
 * @param config - Configuration options for the tree
 * @returns A basic SignalTree with core functionality
 */
function create<T>(obj: T, config: TreeConfig = {}): SignalTree<T> {
  // Validate input
  if (obj === null || obj === undefined) {
    throw new Error('Cannot create SignalTree from null or undefined');
  }

  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  const useLazy = shouldUseLazy(obj, config);

  // Log strategy selection in debug mode
  if (config.debugMode) {
    const estimatedSize = estimateObjectSize(obj);
    console.log(
      `[SignalTree] Creating tree with ${
        useLazy ? 'lazy' : 'eager'
      } strategy (estimated size: ${estimatedSize})`
    );
  }

  // Create signals using appropriate strategy
  let signalState: DeepSignalify<T>;

  try {
    if (useLazy && typeof obj === 'object') {
      signalState = createLazySignalTree(
        obj as object,
        equalityFn
      ) as DeepSignalify<T>;
    } else {
      signalState = createSignalStore(obj, equalityFn);
    }
  } catch (error) {
    // Fallback to eager if lazy fails
    if (useLazy) {
      console.warn(
        '[SignalTree] Lazy creation failed, falling back to eager:',
        error
      );
      signalState = createSignalStore(obj, equalityFn);
    } else {
      throw error;
    }
  }

  const resultTree = {
    state: signalState,
    $: signalState, // $ points to the same state object
  } as SignalTree<T>;
  enhanceTree(resultTree, config);
  return resultTree;
}

/**
 * Creates signals using signal-store pattern for perfect type inference.
 * Eager creation - all signals created immediately.
 *
 * @see https://github.com/JBorgia/signaltree/blob/main/docs/api/create-signal-store.md
 * @template T - The object type to process (preserves exact type structure)
 * @param obj - The object to convert to signals
 * @param equalityFn - Function to compare values for equality
 * @returns A deeply signalified version maintaining exact type structure
 */
function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): DeepSignalify<T> {
  // Primitives, null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as DeepSignalify<T>;
  }

  // Arrays treated as atomic
  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as DeepSignalify<T>;
  }

  // Built-ins treated as atomic
  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as DeepSignalify<T>;
  }

  const out: Record<string | symbol, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Never double-wrap existing signals
    if (isSignal(value)) {
      out[key] = value as unknown;
      continue;
    }

    if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      // Recurse for plain objects
      out[key] = createSignalStore(
        value as Record<string, unknown>,
        equalityFn
      );
    } else {
      // Primitive / array / built-in / function
      out[key] = signal(value, { equal: equalityFn });
    }
  }

  // Copy symbol properties
  for (const sym of Object.getOwnPropertySymbols(obj as object)) {
    const value = (obj as Record<symbol, unknown>)[sym];
    if (isSignal(value)) {
      out[sym] = value;
    } else if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      out[sym] = createSignalStore(
        value as Record<string, unknown>,
        equalityFn
      );
    } else {
      out[sym] = signal(value, { equal: equalityFn });
    }
  }

  return out as DeepSignalify<T>;
}

// ==============================
// Enhancement (moved from inline)
// ==============================
function enhanceTree<T>(tree: SignalTree<T>, config: TreeConfig): void {
  // Version & Metrics
  let __version = 0;
  // Use existing trackPerformance flag from TreeConfig for perf metrics
  const perfEnabled = !!config.trackPerformance;
  const metrics: PerformanceMetrics = {
    updates: 0,
    computations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageUpdateTime: 0,
  };
  const isLazy = shouldUseLazy(tree.state, config);
  // Provide version accessor early so devtools can capture it during registration
  tree.getVersion = () => __version;

  // unwrap implementation
  tree.unwrap = (() => {
    const unwrapObject = <O>(o: DeepSignalify<O>): O => {
      if (o === null || o === undefined || typeof o !== 'object')
        return o as unknown as O;
      const result: { [key: string | symbol]: unknown } = Array.isArray(o)
        ? ([] as unknown as { [key: string | symbol]: unknown })
        : {};
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (isSignal(v)) {
          result[k] = (v as Signal<unknown>)();
        } else if (
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          !isBuiltInObject(v)
        ) {
          result[k] = unwrapObject(v as DeepSignalify<unknown>);
        } else {
          result[k] = v;
        }
      }
      for (const sym of Object.getOwnPropertySymbols(o as object)) {
        const v = (o as Record<symbol, unknown>)[sym];
        if (isSignal(v)) {
          result[sym] = (v as Signal<unknown>)();
        } else if (
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          !isBuiltInObject(v)
        ) {
          result[sym] = unwrapObject(v as DeepSignalify<unknown>);
        } else {
          result[sym] = v;
        }
      }
      return result as O;
    };
    return () => unwrapObject(tree.state as DeepSignalify<T>);
  })();

  // (All subsequent method augmentations below rely on variables above)

  // The following assignments remain unchanged but now in scope
  // (Original code begins)

  /**
   * Updates the state using an updater function with transaction support.
   */
  tree.update = (
    updater: (current: T) => Partial<T>,
    options?: { label?: string; payload?: unknown }
  ) => {
    const perfStart = perfEnabled ? performance.now?.() : 0;
    const transactionLog: Array<{
      path: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];
    // If structural sharing / patch history enabled we also keep a patches list (old/new for leaf changes)
    // Collect middleware hooks (lazy init)
    const middlewareList: Middleware<T>[] =
      (tree as unknown as { __middleware?: Middleware<T>[] }).__middleware ||
      [];
    // Run BEFORE middlewares; if any returns false, abort update silently
    for (const mw of middlewareList) {
      try {
        if (mw.before) {
          const proceed = mw.before('update', updater, tree.unwrap());
          if (proceed === false) {
            return; // veto
          }
        }
      } catch (e) {
        if (config.debugMode) {
          console.warn('[SignalTree] middleware before() error', e);
        }
      }
    }

    try {
      const preState = tree.unwrap();
      const partialObj = updater(preState);

      if (!partialObj || typeof partialObj !== 'object') {
        throw new Error('Updater must return an object');
      }

      const updateObject = <O>(
        target: DeepSignalify<O>,
        updates: Partial<O>,
        path = ''
      ): void => {
        for (const key in updates) {
          if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

          const updateValue = updates[key];
          const currentPath = path ? `${path}.${key}` : key;
          const currentSignalOrState = (target as Record<string, unknown>)[key];

          try {
            if (isSignal(currentSignalOrState)) {
              const originalValue = (currentSignalOrState as Signal<unknown>)();
              // Equality guard: only apply and log if value actually changes
              const changed = !equal(originalValue, updateValue);
              if (changed) {
                transactionLog.push({
                  path: currentPath,
                  oldValue: originalValue,
                  newValue: updateValue,
                });
                (currentSignalOrState as WritableSignal<unknown>).set(
                  updateValue
                );
              }
            } else if (
              typeof updateValue === 'object' &&
              updateValue !== null &&
              !Array.isArray(updateValue) &&
              !isBuiltInObject(updateValue) &&
              typeof currentSignalOrState === 'object' &&
              currentSignalOrState !== null &&
              !isSignal(currentSignalOrState)
            ) {
              // Nested object - recurse
              updateObject(
                currentSignalOrState as DeepSignalify<object>,
                updateValue as Partial<object>,
                currentPath
              );
            } else if (currentSignalOrState === undefined) {
              console.warn(
                `[SignalTree] Cannot update non-existent path: ${currentPath}`
              );
            }
          } catch (error) {
            console.error(
              `[SignalTree] Failed to update path "${currentPath}":`,
              error
            );
            throw error; // Re-throw to trigger rollback
          }
        }
      };

      updateObject(tree.state as DeepSignalify<T>, partialObj);

      // Log transaction in debug mode
      if (config.debugMode && transactionLog.length > 0) {
        console.log(
          '[SignalTree] Update transaction:',
          transactionLog,
          options?.label ? `label=${options.label}` : ''
        );
      }

      // Only increment version & metrics if a real change happened
      if (transactionLog.length > 0) {
        __version++;
        // Attach last patches for time-travel layer to read (always captured)
        (
          tree as unknown as { __lastPatches?: typeof transactionLog }
        ).__lastPatches = transactionLog.slice();
        if (perfEnabled) {
          const dur = (performance.now?.() || 0) - (perfStart || 0);
          metrics.updates++;
          // Exponential moving average for stability
          const alpha = 0.2;
          metrics.averageUpdateTime =
            metrics.averageUpdateTime === 0
              ? dur
              : metrics.averageUpdateTime * (1 - alpha) + dur * alpha;
        }
        // AFTER middlewares (fire & forget) with old/new state distinction
        const postState = tree.unwrap();
        for (const mw of middlewareList) {
          try {
            mw.after?.(
              options?.label || 'update',
              updater,
              preState,
              postState
            );
          } catch (e) {
            if (config.debugMode) {
              console.warn('[SignalTree] middleware after() error', e);
            }
          }
        }
      }
    } catch (error) {
      // Rollback on error
      console.error('[SignalTree] Update failed, attempting rollback:', error);

      // Attempt to restore original values from transaction log
      for (const { path, oldValue } of transactionLog.reverse()) {
        try {
          const pathParts = path.split('.');
          let current: unknown = tree.state;

          for (let i = 0; i < pathParts.length - 1; i++) {
            current = (current as Record<string, unknown>)[pathParts[i]];
            if (!current) break;
          }

          if (current) {
            const lastKey = pathParts[pathParts.length - 1];
            const targetSignal = (current as Record<string, unknown>)[lastKey];
            if (isSignal(targetSignal)) {
              (targetSignal as WritableSignal<unknown>).set(oldValue);
            }
          }
        } catch (rollbackError) {
          console.error(
            '[SignalTree] Rollback failed for path:',
            path,
            rollbackError
          );
        }
      }

      throw error;
    }
  };

  // Pipe implementation for function composition
  tree.pipe = (<TResult = SignalTree<T>>(
    ...fns: Array<(input: unknown) => unknown>
  ): TResult => {
    if (fns.length === 0) {
      return tree as unknown as TResult;
    }

    return fns.reduce((acc, fn) => {
      if (typeof fn !== 'function') {
        throw new Error('All pipe arguments must be functions');
      }
      try {
        return fn(acc);
      } catch (error) {
        console.error('[SignalTree] Pipe function failed:', error);
        throw error;
      }
    }, tree as unknown) as TResult;
  }) as SignalTree<T>['pipe'];
  // Devtools registration (Phase 4) - declare before destroy uses it
  let __devtoolsId: string | null = null;
  if (config.enableDevTools) {
    try {
      __devtoolsId = registerTree(tree, config.treeName);
      if (config.debugMode && __devtoolsId) {
        console.log('[SignalTree] Devtools registered:', __devtoolsId);
      }
    } catch (err) {
      if (config.debugMode) {
        console.warn('[SignalTree] Devtools registration failed', err);
      }
    }
  }

  // Enhanced destroy with proper cleanup
  tree.destroy = () => {
    try {
      // Clean up lazy signal proxies if they exist
      if (isLazy) {
        const state = tree.state as unknown;
        if (state && typeof state === 'object' && '__cleanup__' in state) {
          const cleanup = (state as { __cleanup__: unknown }).__cleanup__;
          if (typeof cleanup === 'function') {
            cleanup();
          }
        }
      }

      // Clear any effects or subscriptions
      // (This would be tracked if we maintain a list of active effects)

      if (config.debugMode) {
        console.log('[SignalTree] Tree destroyed');
      }
    } catch (error) {
      console.error('[SignalTree] Error during cleanup:', error);
    }
    // Devtools unregistration
    if (__devtoolsId) {
      try {
        unregisterTree(__devtoolsId);
        if (config.debugMode) {
          console.log('[SignalTree] Devtools unregistered:', __devtoolsId);
        }
      } catch (err) {
        if (config.debugMode) {
          console.warn('[SignalTree] Devtools unregistration failed', err);
        }
      }
      __devtoolsId = null;
    }
  };

  // Metrics accessor (Phase 3). Implement here so closure captures perfEnabled/metrics.
  tree.getMetrics = (): PerformanceMetrics => {
    if (perfEnabled) return { ...metrics };
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  };

  // Provide untracked passthrough & snapshot helpers will be added in stubs call section
  addStubMethods(tree, config, metrics);

  // Augment with snapshot helpers if devtools enabled
  if (config.enableDevTools) {
    (tree as unknown as { snapshot: () => unknown }).snapshot = () =>
      snapshot(tree.state);
    (tree as unknown as { snapshotMeta: () => unknown }).snapshotMeta = () =>
      __devtoolsId
        ? snapshotTree(__devtoolsId, { includeMetrics: true })
        : null;
  }
  // (asyncAction, time-travel etc. remain appended below inside enhanceTree)

  /**
   * Adds stub implementations for advanced features
   */
  function addStubMethods<T>(
    tree: SignalTree<T>,
    config: TreeConfig,
    metrics?: PerformanceMetrics
  ): void {
    // Stub implementations for advanced features (will log warnings)
    // Simple microtask coalescing (Phase 5 enhancement): multiple batchUpdate calls collapse into one version bump
    let __pendingBatchUpdaters: Array<(current: T) => Partial<T>> = [];
    let __batchScheduled = false;
    tree.batchUpdate = (
      updater: (current: T) => Partial<T>,
      options?: { label?: string; payload?: unknown }
    ) => {
      if (config.batchUpdates) {
        // Wrap updater with label capture
        const labeled = (current: T) => {
          const partial = updater(current);
          return partial;
        };
        (
          labeled as unknown as { __label?: string; __payload?: unknown }
        ).__label = options?.label;
        (labeled as unknown as { __payload?: unknown }).__payload =
          options?.payload;
        __pendingBatchUpdaters.push(labeled);
        if (!__batchScheduled) {
          __batchScheduled = true;
          scheduleTask(() => {
            const fns = __pendingBatchUpdaters;
            __pendingBatchUpdaters = [];
            __batchScheduled = false;
            // Merge outputs; later updaters override earlier key writes
            tree.update(
              (current) => {
                const merged: Partial<T> = {};
                for (const fn of fns) {
                  try {
                    const partial = fn(current);
                    if (partial && typeof partial === 'object') {
                      Object.assign(merged, partial);
                    } else if (config.debugMode) {
                      console.warn(
                        '[SignalTree] batchUpdate updater must return an object'
                      );
                    }
                  } catch (e) {
                    console.error('[SignalTree] batchUpdate updater failed', e);
                  }
                }
                return merged;
              },
              {
                label:
                  fns
                    .map((f) => (f as unknown as { __label?: string }).__label)
                    .filter(Boolean)
                    .join('+') || options?.label,
                payload: undefined,
              }
            );
          });
        }
        return;
      }
      console.warn(
        '⚠️ batchUpdate() called but batching is not enabled.',
        'Set batchUpdates: true or install @signaltree/batching for advanced features.'
      );
      tree.update(updater, options);
    };

    if (config.useMemoization) {
      const memoCache = new Map<string, Signal<unknown>>();
      let autoKeyCounter = 0;
      tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
        const key = cacheKey || `__auto_${autoKeyCounter++}`;
        if (memoCache.has(key)) {
          if (metrics) metrics.cacheHits += 1;
          return memoCache.get(key) as Signal<R>;
        }
        if (metrics) metrics.cacheMisses += 1;
        const c = computed(() => fn(tree.unwrap()));
        memoCache.set(key, c);
        return c;
      };
      tree.clearCache = () => {
        memoCache.clear();
        if (config.debugMode) {
          console.log('[SignalTree] Memoization cache cleared');
        }
      };
    } else {
      tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
        console.warn(
          '⚠️ memoize() called but memoization is not enabled.',
          'To enable memoized computations, install @signaltree/memoization'
        );
        void cacheKey; // Mark as intentionally unused
        return computed(() => fn(tree.unwrap()));
      };
    }

    tree.effect = (fn: (tree: T) => void) => {
      try {
        effect(() => fn(tree.unwrap()));
      } catch (error) {
        // Fallback for test environments without injection context
        if (config.debugMode) {
          console.warn('Effect requires Angular injection context', error);
        }
      }
    };

    // Provide untracked passthrough (Phase 3 minimal)
    (tree as unknown as { untracked: typeof untracked }).untracked = untracked;

    tree.subscribe = (fn: (tree: T) => void): (() => void) => {
      try {
        // Inject destroy ref using exported runtime token
        const destroyRef = inject(DestroyRefToken) as DestroyRef;
        let isDestroyed = false;

        const effectRef = effect(() => {
          if (!isDestroyed) {
            fn(tree.unwrap());
          }
        });

        const unsubscribe = () => {
          isDestroyed = true;
          effectRef.destroy();
        };

        destroyRef.onDestroy(unsubscribe as () => void);
        return unsubscribe;
      } catch (error) {
        // Fallback for test environment
        if (config.debugMode) {
          console.warn('Subscribe requires Angular injection context', error);
        }
        fn(tree.unwrap());
        return () => {
          // No-op unsubscribe
        };
      }
    };

    // Performance stubs
    tree.optimize = () => {
      if (config.debugMode) {
        console.warn(
          '⚠️ optimize() called but tree optimization is not available.'
        );
      }
    };

    if (!config.useMemoization) {
      tree.clearCache = () => {
        if (config.debugMode) {
          console.warn('⚠️ clearCache() called but caching is not available.');
        }
      };
    }

    // Basic middleware management (Phase 5 incremental)
    (tree as unknown as { __middleware?: Middleware<T>[] }).__middleware = [];
    tree.addTap = (middleware: Middleware<T>) => {
      const list = (tree as unknown as { __middleware: Middleware<T>[] })
        .__middleware;
      list.push(middleware);
    };
    tree.removeTap = (id: string) => {
      const holder = tree as unknown as { __middleware: Middleware<T>[] };
      holder.__middleware = holder.__middleware.filter((m) => m.id !== id);
    };

    tree.invalidatePattern = (): number => {
      if (config.debugMode) {
        console.warn(
          '⚠️ invalidatePattern() called but performance optimization is not enabled.'
        );
      }
      return 0;
    };

    // getMetrics implemented in enhanceTree (Phase 3)

    // Basic selector helper built atop memoize OR computed
    tree.select = <R>(
      selector: (state: T) => R,
      cacheKey?: string
    ): Signal<R> => {
      if (tree.memoize && config.useMemoization) {
        return tree.memoize(selector, cacheKey);
      }
      return computed(() => selector(tree.unwrap()));
    };

    // Middleware stubs removed (real implementation above)

    // Entity helpers implementation (basic CRUD over an entity array property)
    const __crudRegistry = new Map<
      string | number | symbol | undefined,
      unknown
    >();
    tree.asCrud = <E extends { id: string | number }>(
      entityKey?: keyof T
    ): EntityHelpers<E> => {
      const regKey = entityKey as string | number | symbol | undefined;
      if (__crudRegistry.has(regKey)) {
        return __crudRegistry.get(regKey) as EntityHelpers<E>;
      }

      // Internal storage if no entityKey provided (non-reactive warning)
      let internal: E[] = [];
      const entitySignal = entityKey
        ? (tree.state as Record<string | symbol, unknown>)[
            entityKey as unknown as string
          ]
        : undefined;

      if (entityKey && entitySignal && !isSignal(entitySignal)) {
        if (config.debugMode) {
          console.warn(
            '[SignalTree] asCrud(): target key is not a signal array – operations may not be reactive'
          );
        }
      }

      const getEntities = (): E[] => {
        if (entityKey && entitySignal && isSignal(entitySignal)) {
          const value = (entitySignal as Signal<unknown>)();
          if (Array.isArray(value)) return value as E[];
          return [];
        }
        return internal;
      };

      const setEntities = (list: E[]) => {
        if (entityKey && entitySignal && isSignal(entitySignal)) {
          tree.update(() => ({ [entityKey]: list } as Partial<T>));
        } else {
          internal = list;
          if (config.debugMode && !entityKey) {
            console.warn(
              '[SignalTree] asCrud(): using internal store without entityKey – changes are not reactive to consumers.'
            );
          }
        }
      };

      const helpers: EntityHelpers<E> = {
        add(entity: E) {
          const list = getEntities();
          if (list.some((e) => e.id === entity.id)) return; // skip duplicates
          setEntities([...list, entity]);
        },
        update(id: E['id'], updates: Partial<E>) {
          const list = getEntities();
          let changed = false;
          const next = list.map((e) => {
            if (e.id === id) {
              changed = true;
              return { ...e, ...updates } as E;
            }
            return e;
          });
          if (changed) setEntities(next);
        },
        remove(id: E['id']) {
          const list = getEntities();
          const next = list.filter((e) => e.id !== id);
          if (next.length !== list.length) setEntities(next);
        },
        upsert(entity: E) {
          const list = getEntities();
          const idx = list.findIndex((e) => e.id === entity.id);
          if (idx === -1) setEntities([...list, entity]);
          else {
            const next = [...list];
            next[idx] = entity;
            setEntities(next);
          }
        },
        findById(id: E['id']): Signal<E | undefined> {
          return computed(() => getEntities().find((e) => e.id === id));
        },
        findBy(predicate: (entity: E) => boolean): Signal<E[]> {
          return computed(() => getEntities().filter(predicate));
        },
        selectIds(): Signal<Array<string | number>> {
          return computed(() => getEntities().map((e) => e.id));
        },
        selectAll(): Signal<E[]> {
          return computed(() => getEntities());
        },
        selectTotal(): Signal<number> {
          return computed(() => getEntities().length);
        },
        findAll(): Signal<E[]> {
          return computed(() => getEntities());
        },
        clear() {
          if (getEntities().length > 0) setEntities([]);
        },
      };

      __crudRegistry.set(regKey, helpers);
      return helpers;
    };

    // Provide asyncAction stub (real implementation supplied by @signaltree/async enhancer package)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tree as any).asyncAction = () => {
      throw new Error(
        'asyncAction not installed. Import and apply withAsync() from @signaltree/async.'
      );
    };
    // Attach modular time-travel feature
    createTimeTravelFeature<T>().enable(tree, config);
  }

  // ============================================
  // PUBLIC API
  // ============================================
}

// Public factory with lightweight overloads
export function signalTree<T>(obj: T): SignalTree<T>;
export function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;
export function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;
export function signalTree<T>(
  obj: T,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<T> {
  if (typeof configOrPreset === 'string') {
    const presetConfigs: Record<TreePreset, Partial<TreeConfig>> = {
      basic: { useLazySignals: false, debugMode: false },
      performance: {
        useLazySignals: true,
        batchUpdates: true,
        useMemoization: true,
        useShallowComparison: true,
      },
      development: {
        useLazySignals: false,
        debugMode: true,
        enableDevTools: true,
        trackPerformance: true,
      },
      production: {
        useLazySignals: true,
        batchUpdates: true,
        useMemoization: true,
        debugMode: false,
      },
    };
    const config = presetConfigs[configOrPreset];
    if (!config) {
      console.warn(
        `Unknown preset: ${configOrPreset}, using default configuration`
      );
      return create(obj, {});
    }
    return create(obj, config);
  }
  return create(obj, configOrPreset || {});
}
