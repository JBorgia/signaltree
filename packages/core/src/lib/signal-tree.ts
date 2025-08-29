/**
 * SignalTree Core v1.1.6
 * Copyright (c) 2025 Jonathan D Borgia
 * @see https://github.com/JBorgia/signaltree/blob/main/LICENSE
 */
import { computed, DestroyRef, effect, inject, isSignal, Signal, signal, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { resolveEnhancerOrder } from './enhancers';
import { createLazySignalTree, equal, isBuiltInObject } from './utils';


import type {
  SignalTree,
  DeepSignalify,
  TreeConfig,
  TreePreset,
  Middleware,
  PerformanceMetrics,
  EntityHelpers,
  AsyncActionConfig,
  AsyncAction,
  TimeTravelEntry,
  EnhancerWithMeta,
  ChainResult,
  WithMethod,
} from './types';

// Type alias for internal use
type LocalUnknownEnhancer = EnhancerWithMeta<unknown, unknown>;

// ============================================
// PERFORMANCE HEURISTICS
// ============================================

/**
 * Estimates the size of an object for strategy selection
 *
 * @param obj - Object to estimate
 * @param maxDepth - Maximum depth to traverse
 * @param currentDepth - Current recursion depth
 * @returns Estimated size
 */
function estimateObjectSize(
  obj: unknown,
  maxDepth = SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH,
  currentDepth = 0
): number {
  if (currentDepth >= maxDepth) return 1;
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== 'object') return 1;

  let size = 0;

  try {
    if (Array.isArray(obj)) {
      size = obj.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY,
        obj.length
      );
      for (let i = 0; i < sampleSize; i++) {
        size += estimateObjectSize(obj[i], maxDepth, currentDepth + 1) * 0.1;
      }
    } else {
      const keys = Object.keys(obj);
      size = keys.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT,
        keys.length
      );
      for (let i = 0; i < sampleSize; i++) {
        const value = (obj as Record<string, unknown>)[keys[i]];
        size += estimateObjectSize(value, maxDepth, currentDepth + 1) * 0.5;
      }
    }
  } catch {
    return 1;
  }

  return Math.floor(size);
}

/**
 * Determines whether to use lazy signal creation
 *
 * @param obj - Object to analyze
 * @param config - Tree configuration
 * @param precomputedSize - Optional pre-computed size
 * @returns Whether to use lazy strategy
 */
function shouldUseLazy(
  obj: unknown,
  config: TreeConfig,
  precomputedSize?: number
): boolean {
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
  const estimatedSize = precomputedSize ?? estimateObjectSize(obj);
  return estimatedSize > SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD;
}

/**
 * Creates an equality function based on configuration
 */
function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

// ============================================
// SIGNAL CREATION
// ============================================

/**
 * Creates signals using eager strategy
 *
 * @param obj - Object to convert to signals
 * @param equalityFn - Equality function for signals
 * @returns Deeply signalified object
 */
function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): DeepSignalify<T> {
  // Handle primitives and null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  // Handle arrays - treat as primitive signal
  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  // Handle built-in objects
  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  const store: Partial<DeepSignalify<T>> = {};
  const processedObjects = new WeakSet<object>();

  // Prevent circular references
  if (processedObjects.has(obj as object)) {
    console.warn(SIGNAL_TREE_MESSAGES.CIRCULAR_REF);
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }
  processedObjects.add(obj as object);

  try {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      try {
        if (typeof key === 'symbol') continue;

        // Never double-wrap signals
        if (isSignal(value)) {
          (store as Record<string, unknown>)[key] = value;
          continue;
        }

        // Handle different value types
        if (value === null || value === undefined) {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (typeof value !== 'object') {
          // Primitives
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (Array.isArray(value) || isBuiltInObject(value)) {
          // Arrays and built-in objects
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else {
          // Nested objects - recurse
          const branch = createSignalStore(value, equalityFn);

          // Attach set/update methods to branch nodes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!('set' in branch)) {
            (branch as any)['set'] = function (partial: Partial<any>) {
              for (const k in partial) {
                if (!Object.prototype.hasOwnProperty.call(partial, k)) continue;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const v = (partial as any)[k];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const node = (branch as any)[k];
                if (
                  typeof node === 'object' &&
                  node !== null &&
                  !Array.isArray(node) &&
                  !isSignal(node)
                ) {
                  if (typeof node['set'] === 'function') {
                    node['set'](v);
                  }
                } else if (isSignal(node)) {
                  (node as WritableSignal<unknown>).set(v);
                }
              }
            };
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!('update' in branch)) {
            (branch as any)['update'] = function (
              updater: (current: any) => Partial<any>
            ) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const current = {} as any;
              for (const k in branch) {
                if (!Object.prototype.hasOwnProperty.call(branch, k)) continue;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const node = (branch as any)[k];
                if (isSignal(node)) {
                  current[k] = (node as Signal<unknown>)();
                }
              }
              const partial = updater(current);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (typeof (branch as any)['set'] === 'function') {
                (branch as any)['set'](partial);
              }
            };
          }

          (store as Record<string, unknown>)[key] = branch;
        }
      } catch (error) {
        console.warn(
          `${SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED} "${key}":`,
          error
        );
        // Fallback: treat as primitive
        (store as Record<string, unknown>)[key] = signal(value, {
          equal: equalityFn,
        });
      }
    }

    // Handle symbol properties
    const symbols = Object.getOwnPropertySymbols(obj);
    for (const sym of symbols) {
      const value = (obj as Record<symbol, unknown>)[sym];
      try {
        if (isSignal(value)) {
          (store as Record<symbol, unknown>)[sym] = value;
        } else {
          (store as Record<symbol, unknown>)[sym] = signal(value, {
            equal: equalityFn,
          });
        }
      } catch (error) {
        console.warn(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED, error);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to create signal store: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }

  return store as DeepSignalify<T>;
}

// ============================================
// TREE ENHANCEMENT
// ============================================

/**
 * Enhances a tree with basic functionality
 */
function enhanceTree<T>(
  tree: SignalTree<T>,
  config: TreeConfig = {}
): SignalTree<T> {
  const isLazy = config.useLazySignals ?? shouldUseLazy(tree.state, config);

  // Implement unwrap method
  tree.unwrap = (): T => {
    const unwrapObject = <O>(obj: DeepSignalify<O>): O => {
      if (typeof obj !== 'object' || obj === null) {
        return obj as O;
      }

      if (isSignal(obj)) {
        return (obj as Signal<O>)();
      }

      const result = {} as Record<string, unknown>;

      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

        const value = (obj as Record<string, unknown>)[key];

        // Skip runtime-attached methods
        if (
          (key === 'set' || key === 'update') &&
          typeof value === 'function'
        ) {
          continue;
        }

        if (isSignal(value)) {
          result[key] = (value as Signal<unknown>)();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          !isBuiltInObject(value)
        ) {
          result[key] = unwrapObject(value as DeepSignalify<object>);
        } else {
          result[key] = value;
        }
      }

      // Handle symbol properties
      const symbols = Object.getOwnPropertySymbols(obj);
      for (const sym of symbols) {
        const value = (obj as Record<symbol, unknown>)[sym];
        if (isSignal(value)) {
          (result as Record<symbol, unknown>)[sym] = (
            value as Signal<unknown>
          )();
        } else {
          (result as Record<symbol, unknown>)[sym] = value;
        }
      }

      return result as O;
    };

    return unwrapObject(tree.state as DeepSignalify<T>);
  };

  // Implement update method with transaction support
  tree.update = (updater: (current: T) => Partial<T>) => {
    const transactionLog: Array<{
      path: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    try {
      const currentValue = tree.unwrap();
      const partialObj = updater(currentValue);

      if (!partialObj || typeof partialObj !== 'object') {
        throw new Error(SIGNAL_TREE_MESSAGES.UPDATER_INVALID);
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
              transactionLog.push({
                path: currentPath,
                oldValue: originalValue,
                newValue: updateValue,
              });
              (currentSignalOrState as WritableSignal<unknown>).set(
                updateValue
              );
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
                `${SIGNAL_TREE_MESSAGES.UPDATE_PATH_NOT_FOUND} ${currentPath}`
              );
            }
          } catch (error) {
            console.error(
              `${SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED} "${currentPath}":`,
              error
            );
            throw error; // Re-throw to trigger rollback
          }
        }
      };

      updateObject(tree.state as DeepSignalify<T>, partialObj);

      if (config.debugMode && transactionLog.length > 0) {
        console.log(SIGNAL_TREE_MESSAGES.UPDATE_TRANSACTION, transactionLog);
      }
    } catch (error) {
      console.error(SIGNAL_TREE_MESSAGES.UPDATE_FAILED, error);

      // Attempt rollback
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
            `${SIGNAL_TREE_MESSAGES.ROLLBACK_FAILED} ${path}:`,
            rollbackError
          );
        }
      }

      throw error;
    }
  };

  // Implement with method for enhancer composition
  tree.with = (<E extends Array<EnhancerWithMeta<unknown, unknown>>>(
    ...enhancers: E
  ): ChainResult<SignalTree<T>, E> => {
    if (enhancers.length === 0) {
      return tree as unknown as ChainResult<SignalTree<T>, E>;
    }

    // Compute core capabilities
    const coreCapabilities = new Set<string>();
    if (config.batchUpdates) coreCapabilities.add('batchUpdate');
    if (config.useMemoization) coreCapabilities.add('memoize');
    if (config.enableTimeTravel) coreCapabilities.add('undo');
    if (config.enableDevTools) coreCapabilities.add('connectDevTools');

    try {
      for (const key of Object.keys(tree)) coreCapabilities.add(String(key));
    } catch {
      // Ignore reflection issues
    }

    // Resolve enhancer order if metadata is present
    const hasMetadata = enhancers.some((e) =>
      Boolean(e.metadata && (e.metadata.requires || e.metadata.provides))
    );

    let orderedEnhancers = enhancers as LocalUnknownEnhancer[];

    if (hasMetadata) {
      try {
        orderedEnhancers = resolveEnhancerOrder(
          enhancers as LocalUnknownEnhancer[],
          coreCapabilities,
          config.debugMode
        );
      } catch (err) {
        console.warn(SIGNAL_TREE_MESSAGES.ENHANCER_ORDER_FAILED, err);
      }
    }

    // Apply enhancers
    const provided = new Set<string>(coreCapabilities);
    let currentTree: unknown = tree;

    for (let i = 0; i < orderedEnhancers.length; i++) {
      const enhancer = orderedEnhancers[i];

      if (typeof enhancer !== 'function') {
        throw new Error(
          SIGNAL_TREE_MESSAGES.ENHANCER_NOT_FUNCTION.replace('%d', String(i))
        );
      }

      // Validate requirements
      const reqs = enhancer.metadata?.requires ?? [];
      for (const r of reqs) {
        if (!(r in (currentTree as object)) && !provided.has(r)) {
          const name = enhancer.metadata?.name ?? `enhancer#${i}`;
          const msg = SIGNAL_TREE_MESSAGES.ENHANCER_REQUIREMENT_MISSING.replace(
            '%s',
            name
          ).replace('%s', r);
          if (config.debugMode) {
            throw new Error(msg);
          } else {
            console.warn(msg);
          }
        }
      }

      try {
        const result = enhancer(currentTree as unknown);
        if (result !== currentTree) currentTree = result;

        // Register provided capabilities
        const provs = enhancer.metadata?.provides ?? [];
        for (const p of provs) provided.add(p);

        // Validate promises in debug mode
        if (config.debugMode && provs.length > 0) {
          for (const p of provs) {
            if (!(p in (currentTree as object))) {
              console.warn(
                SIGNAL_TREE_MESSAGES.ENHANCER_PROVIDES_MISSING.replace(
                  '%s',
                  enhancer.metadata?.name ?? String(i)
                ).replace('%s', p)
              );
            }
          }
        }
      } catch (error) {
        const name = enhancer.metadata?.name || `enhancer at index ${i}`;
        console.error(
          SIGNAL_TREE_MESSAGES.ENHANCER_FAILED.replace('%s', name),
          error
        );
        if (config.debugMode) {
          console.error('[SignalTree] Enhancer stack trace:', enhancer);
          console.error('[SignalTree] Tree state at failure:', currentTree);
        }
        throw error;
      }
    }

    return currentTree as ChainResult<SignalTree<T>, E>;
  }) as unknown as WithMethod<T>;

  // Implement destroy method
  tree.destroy = () => {
    try {
      if (isLazy) {
        const state = tree.state as unknown;
        if (state && typeof state === 'object' && '__cleanup__' in state) {
          const cleanup = (state as { __cleanup__: unknown }).__cleanup__;
          if (typeof cleanup === 'function') {
            cleanup();
          }
        }
      }

      if (config.debugMode) {
        console.log(SIGNAL_TREE_MESSAGES.TREE_DESTROYED);
      }
    } catch (error) {
      console.error(SIGNAL_TREE_MESSAGES.CLEANUP_ERROR, error);
    }
  };

  // Add stub implementations for advanced features
  addStubMethods(tree, config);

  return tree;
}

/**
 * Adds stub implementations for advanced features
 */
function addStubMethods<T>(tree: SignalTree<T>, config: TreeConfig): void {
  tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
    console.warn(SIGNAL_TREE_MESSAGES.BATCH_NOT_ENABLED);
    tree.update(updater);
  };

  tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
    console.warn(SIGNAL_TREE_MESSAGES.MEMOIZE_NOT_ENABLED);
    void cacheKey;
    return computed(() => fn(tree.unwrap()));
  };

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      if (config.debugMode) {
        console.warn(SIGNAL_TREE_MESSAGES.EFFECT_NO_CONTEXT, error);
      }
    }
  };

  tree.subscribe = (fn: (tree: T) => void): (() => void) => {
    try {
      const destroyRef = inject(DestroyRef);
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

      destroyRef.onDestroy(unsubscribe);
      return unsubscribe;
    } catch (error) {
      if (config.debugMode) {
        console.warn(SIGNAL_TREE_MESSAGES.SUBSCRIBE_NO_CONTEXT, error);
      }
      fn(tree.unwrap());
      return () => {
        // No-op
      };
    }
  };

  // Performance stubs
  tree.optimize = () => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.OPTIMIZE_NOT_AVAILABLE);
    }
  };

  tree.clearCache = () => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.CACHE_NOT_AVAILABLE);
    }
  };

  tree.invalidatePattern = (): number => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.PERFORMANCE_NOT_ENABLED);
    }
    return 0;
  };

  tree.getMetrics = (): PerformanceMetrics => {
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  };

  // Middleware stubs
  tree.addTap = (middleware: Middleware<T>) => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.MIDDLEWARE_NOT_AVAILABLE);
    }
    void middleware;
  };

  tree.removeTap = (id: string) => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.MIDDLEWARE_NOT_AVAILABLE);
    }
    void id;
  };

  // Entity helpers stub
  tree.asCrud = <E extends { id: string | number }>(): EntityHelpers<E> => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.ENTITY_HELPERS_NOT_AVAILABLE);
    }
    return {} as EntityHelpers<E>;
  };

  // Async action stub
  tree.asyncAction = <TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    asyncConfig: AsyncActionConfig<T, TResult> = {}
  ): AsyncAction<TInput, TResult> => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.ASYNC_ACTIONS_NOT_AVAILABLE);
    }
    void operation;
    void asyncConfig;
    return {} as AsyncAction<TInput, TResult>;
  };

  // Time travel stubs
  tree.undo = () => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.TIME_TRAVEL_NOT_AVAILABLE);
    }
  };

  tree.redo = () => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.TIME_TRAVEL_NOT_AVAILABLE);
    }
  };

  tree.getHistory = (): TimeTravelEntry<T>[] => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.TIME_TRAVEL_NOT_AVAILABLE);
    }
    return [];
  };

  tree.resetHistory = () => {
    if (config.debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.TIME_TRAVEL_NOT_AVAILABLE);
    }
  };
}

// ============================================
// CORE CREATION FUNCTION
// ============================================

/**
 * Core function to create a SignalTree
 */
function create<T>(obj: T, config: TreeConfig = {}): SignalTree<T> {
  // Validate input
  if (obj === null || obj === undefined) {
    throw new Error(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED);
  }

  const estimatedSize = estimateObjectSize(obj);
  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  const useLazy = shouldUseLazy(obj, config, estimatedSize);

  // Log strategy selection in debug mode
  if (config.debugMode) {
    console.log(
      SIGNAL_TREE_MESSAGES.STRATEGY_SELECTION.replace(
        '%s',
        useLazy ? 'lazy' : 'eager'
      ).replace('%d', String(estimatedSize))
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
      console.warn(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK, error);
      signalState = createSignalStore(obj, equalityFn);
    } else {
      throw error;
    }
  }

  const resultTree = {
    state: signalState,
    $: signalState,
  } as SignalTree<T>;

  enhanceTree(resultTree, config);
  return resultTree;
}

// ============================================
// PRESET CONFIGURATIONS
// ============================================

const presetConfigs: Record<TreePreset, Partial<TreeConfig>> = {
  basic: {
    useLazySignals: false,
    debugMode: false,
  },
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

// ============================================
// PUBLIC API
// ============================================

/**
 * Creates a reactive signal tree with automatic configuration
 */
export function signalTree<T>(obj: T): SignalTree<T>;

/**
 * Creates a reactive signal tree with preset configuration
 */
export function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;

/**
 * Creates a reactive signal tree with custom configuration
 */
export function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;

/**
 * Creates a reactive signal tree with enhanced type inference
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: Required<T>,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<Required<T>>;

export function signalTree<T>(
  obj: T,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<T>;

export function signalTree<T>(
  obj: T,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<T> {
  // Handle preset strings
  if (typeof configOrPreset === 'string') {
    const config = presetConfigs[configOrPreset];
    if (!config) {
      console.warn(
        SIGNAL_TREE_MESSAGES.PRESET_UNKNOWN.replace('%s', configOrPreset)
      );
      return create(obj, {});
    }
    return create(obj, config);
  }

  // Handle configuration objects or default
  const config = configOrPreset || {};
  return create(obj, config);
}
