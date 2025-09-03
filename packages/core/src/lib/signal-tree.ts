import {
  computed,
  DestroyRef,
  effect,
  inject,
  isSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { resolveEnhancerOrder } from './enhancers';
import { createLazySignalTree, equal, isBuiltInObject, unwrap } from './utils';

// Global symbol for NodeAccessor identification
const NODE_ACCESSOR_SYMBOL = Symbol.for('NodeAccessor');

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
  NodeAccessor,
} from './types';

// Type alias for internal use
type LocalUnknownEnhancer = EnhancerWithMeta<unknown, unknown>;

/**
 * Creates a callable NodeAccessor for nested objects WITHOUT a backing signal
 * This accessor reads from and writes to child signals directly
 */
function makeNodeAccessor<T>(): NodeAccessor<T> {
  const accessor = function (this: any, arg?: unknown): T | void {
    if (arguments.length === 0) {
      // Read from child signals
      return unwrap(this);
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const currentValue = unwrap(this) as T;
      const newValue = updater(currentValue);
      recursiveUpdate(this, newValue);
    } else {
      // Direct set
      recursiveUpdate(this, arg);
    }
  } as NodeAccessor<T>;

  (accessor as any)[NODE_ACCESSOR_SYMBOL] = true;
  return accessor;
}

/**
 * Creates a NodeAccessor for the root tree that manages a backing signal
 */
function makeRootNodeAccessor<T>(
  readSignal: Signal<T>,
  writeSignal: WritableSignal<T>
): NodeAccessor<T> {
  const accessor = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return readSignal();
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      writeSignal.set(updater(readSignal()));
    } else {
      writeSignal.set(arg as T);
    }
  } as NodeAccessor<T>;

  (accessor as any)[NODE_ACCESSOR_SYMBOL] = true;
  return accessor;
}

function recursiveUpdate(target: any, updates: any) {
  for (const key in updates) {
    if (!(key in target)) continue;

    const targetProp = target[key];
    const updateValue = updates[key];

    if (isSignal(targetProp)) {
      // Leaf signal - check if it's writable
      if ('set' in targetProp && typeof targetProp.set === 'function') {
        (targetProp as WritableSignal<any>).set(updateValue);
      }
    } else if (isNodeAccessor(targetProp)) {
      // Let the NodeAccessor handle it
      targetProp(updateValue);
    }
  }
}

/**
 * Checks if a value is a NodeAccessor
 */
export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' &&
    value &&
    (value as any)[NODE_ACCESSOR_SYMBOL] === true
  );
}

// ============================================
// PERFORMANCE HEURISTICS
// ============================================

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

function shouldUseLazy(
  obj: unknown,
  config: TreeConfig,
  precomputedSize?: number
): boolean {
  if (config.useLazySignals !== undefined) return config.useLazySignals;
  if (config.debugMode || config.enableDevTools) return false;
  if (config.batchUpdates && config.useMemoization) return true;
  const estimatedSize = precomputedSize ?? estimateObjectSize(obj);
  return estimatedSize > SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD;
}

function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

// ============================================
// SIGNAL CREATION
// ============================================

function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): DeepSignalify<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }

  const store: Partial<DeepSignalify<T>> = {};
  const processedObjects = new WeakSet<object>();

  if (processedObjects.has(obj as object)) {
    console.warn(SIGNAL_TREE_MESSAGES.CIRCULAR_REF);
    return signal(obj, { equal: equalityFn }) as unknown as DeepSignalify<T>;
  }
  processedObjects.add(obj as object);

  try {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      try {
        if (typeof key === 'symbol') continue;

        if (isSignal(value)) {
          (store as Record<string, unknown>)[key] = value;
          continue;
        }

        if (value === null || value === undefined) {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (typeof value !== 'object') {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (Array.isArray(value) || isBuiltInObject(value)) {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else {
          // Nested object - create recursive structure
          const branch = createSignalStore(value, equalityFn);

          // Create a NodeAccessor for this nested object (no backing signal)
          const callableBranch = makeNodeAccessor<typeof value>();

          // Copy all the nested signal properties onto the callable branch
          for (const branchKey in branch) {
            if (Object.prototype.hasOwnProperty.call(branch, branchKey)) {
              try {
                Object.defineProperty(callableBranch, branchKey, {
                  value: (branch as Record<string, unknown>)[branchKey],
                  enumerable: true,
                  configurable: true,
                });
              } catch {
                // Skip if property can't be defined
              }
            }
          }

          (store as Record<string, unknown>)[key] = callableBranch;
        }
      } catch (error) {
        console.warn(
          `${SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED} "${key}":`,
          error
        );
        (store as Record<string, unknown>)[key] = signal(value, {
          equal: equalityFn,
        });
      }
    }

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

function enhanceTree<T>(
  tree: SignalTree<T>,
  config: TreeConfig = {}
): SignalTree<T> {
  const isLazy = config.useLazySignals ?? shouldUseLazy(tree.state, config);

  // with() enhancer composition
  tree.with = (<E extends Array<EnhancerWithMeta<unknown, unknown>>>(
    ...enhancers: E
  ): ChainResult<SignalTree<T>, E> => {
    if (enhancers.length === 0) {
      return tree as unknown as ChainResult<SignalTree<T>, E>;
    }

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

    const provided = new Set<string>(coreCapabilities);
    let currentTree: unknown = tree;

    for (let i = 0; i < orderedEnhancers.length; i++) {
      const enhancer = orderedEnhancers[i];

      if (typeof enhancer !== 'function') {
        throw new Error(
          SIGNAL_TREE_MESSAGES.ENHANCER_NOT_FUNCTION.replace('%d', String(i))
        );
      }

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

        const provs = enhancer.metadata?.provides ?? [];
        for (const p of provs) provided.add(p);

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

  // destroy unchanged
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

function addStubMethods<T>(tree: SignalTree<T>, config: TreeConfig): void {
  tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
    console.warn(SIGNAL_TREE_MESSAGES.BATCH_NOT_ENABLED);
    tree((current: T) => {
      const partial = updater(current);
      return { ...current, ...partial } as T;
    });
  };

  tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
    console.warn(SIGNAL_TREE_MESSAGES.MEMOIZE_NOT_ENABLED);
    void cacheKey;
    return computed(() => fn(tree()));
  };

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree()));
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
          fn(tree());
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
      fn(tree());
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

function create<T>(obj: T, config: TreeConfig = {}): SignalTree<T> {
  if (obj === null || obj === undefined) {
    throw new Error(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED);
  }

  const estimatedSize = estimateObjectSize(obj);
  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);

  // ARRAY ROOT MODE: arrays are treated as single signals
  if (Array.isArray(obj)) {
    const signalState = signal(obj as unknown as T, {
      equal: equalityFn,
    }) as WritableSignal<T>;

    const tree = makeRootNodeAccessor(
      signalState,
      signalState
    ) as SignalTree<T>;

    // Add state and $ properties that reference the signal itself
    Object.defineProperty(tree, 'state', {
      value: signalState,
      enumerable: false,
    });
    Object.defineProperty(tree, '$', { value: signalState, enumerable: false });

    enhanceTree(tree, config);
    return tree;
  }

  const useLazy = shouldUseLazy(obj, config, estimatedSize);

  if (config.debugMode) {
    console.log(
      SIGNAL_TREE_MESSAGES.STRATEGY_SELECTION.replace(
        '%s',
        useLazy ? 'lazy' : 'eager'
      ).replace('%d', String(estimatedSize))
    );
  }

  let signalState: DeepSignalify<T>;

  try {
    if (useLazy && typeof obj === 'object') {
      signalState = createLazySignalTree(
        obj as object,
        equalityFn
      ) as DeepSignalify<T>;
    } else {
      signalState = createSignalStore(obj, equalityFn) as DeepSignalify<T>;
    }
  } catch (error) {
    if (useLazy) {
      console.warn(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK, error);
      signalState = createSignalStore(obj, equalityFn) as DeepSignalify<T>;
    } else {
      throw error;
    }
  }

  // Create callable tree function for the root
  const tree = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return unwrap(signalState);
    }
    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const currentValue = unwrap(signalState);
      const newValue = updater(currentValue);
      // Use recursive update to preserve signals
      recursiveUpdate(tree, newValue);
    } else {
      // Direct set - use recursive update
      recursiveUpdate(tree, arg);
    }
  } as SignalTree<T>;

  // Mark as NodeAccessor
  Object.defineProperty(tree, NODE_ACCESSOR_SYMBOL, {
    value: true,
    enumerable: false,
  });

  // Add state and $ properties first (these are safe)
  Object.defineProperty(tree, 'state', {
    value: signalState,
    enumerable: false,
  });
  Object.defineProperty(tree, '$', { value: signalState, enumerable: false });

  // Enhance tree with methods
  enhanceTree(tree, config);

  // Attach signal state properties to the tree AFTER enhancement
  // This prevents conflicts with built-in methods
  for (const key in signalState) {
    if (Object.prototype.hasOwnProperty.call(signalState, key)) {
      // Skip if the property already exists (from enhancement)
      if (!(key in tree)) {
        try {
          Object.defineProperty(tree, key, {
            value: (signalState as Record<string, unknown>)[key],
            enumerable: true,
            configurable: true,
          });
        } catch {
          // Skip if property can't be defined
        }
      }
    }
  }

  return tree;
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

export function signalTree<T>(obj: T): SignalTree<T>;
export function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;
export function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;
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

  const config = configOrPreset || {};
  return create(obj, config);
}

/**
 * Typed helper to apply a single enhancer to a tree when `.with` inference
 * produces `unknown`. This is a pragmatic escape hatch for tests and
 * migration until `.with` overloads are simplified.
 */
export function applyEnhancer<T, O>(
  tree: SignalTree<T>,
  enhancer: EnhancerWithMeta<SignalTree<any>, O>
): O {
  return enhancer(tree) as O;
}
