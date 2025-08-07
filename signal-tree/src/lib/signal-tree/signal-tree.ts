import {
  Signal,
  WritableSignal,
  isSignal,
  signal,
  computed,
  effect,
  inject,
  DestroyRef,
  Directive,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  ElementRef,
  Renderer2,
  HostListener,
  OnInit,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import isEqual from 'lodash/isEqual';
import { Observable } from 'rxjs';

// ============================================
// CORE TYPES AND INTERFACES
// ============================================

// Define primitive types for better type constraints
type Primitive = string | number | boolean | null | undefined | bigint | symbol;

// Helper type to check if a type is a primitive
type IsPrimitive<T> = T extends Primitive ? true : false;

// Deep signalify type with proper generic constraints
export type DeepSignalify<T> = IsPrimitive<T> extends true
  ? WritableSignal<T>
  : T extends (infer U)[]
  ? WritableSignal<U[]>
  : T extends Record<string, unknown>
  ? T extends Signal<infer TSignal>
    ? WritableSignal<TSignal>
    : { [K in keyof T]: DeepSignalify<T[K]> }
  : WritableSignal<T>;

// Helper type for unwrapping signal states back to original types
export type UnwrapSignalState<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Record<string, unknown>
  ? { [K in keyof T]: UnwrapSignalState<T[K]> }
  : T;

export type SimpleSignalValue = string | number | boolean;

export type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

/**
 * Configuration options for creating signal trees
 */
export interface TreeConfig {
  enablePerformanceFeatures?: boolean;
  batchUpdates?: boolean;
  useMemoization?: boolean;
  trackPerformance?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  enableTimeTravel?: boolean;
  enableDevTools?: boolean;
  treeName?: string;
}

/**
 * Performance metrics tracked by the tree
 */
export interface PerformanceMetrics {
  updates: number;
  computations: number;
  cacheHits: number;
  cacheMisses: number;
  averageUpdateTime: number;
  memoryUsage?: number;
  timeTravelEntries?: number;
}

/**
 * Entry in the time travel history
 */
export interface TimeTravelEntry<T> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}

/**
 * Middleware interface for intercepting tree operations
 */
export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

/**
 * Entity helpers interface for CRUD operations
 */
export interface EntityHelpers<E extends { id: string | number }> {
  add: (entity: E) => void;
  update: (id: string | number, updates: Partial<E>) => void;
  remove: (id: string | number) => void;
  upsert: (entity: E) => void;
  findById: (id: string | number) => Signal<E | undefined>;
  findBy: (predicate: (entity: E) => boolean) => Signal<E[]>;
  selectIds: () => Signal<Array<string | number>>;
  selectAll: () => Signal<E[]>;
  selectTotal: () => Signal<number>;
}

/**
 * Configuration for async actions
 */
export interface AsyncActionConfig<T, TResult> {
  loadingKey?: string;
  errorKey?: string;
  onSuccess?: (result: TResult, tree: SignalTree<T>) => void;
  onError?: (error: unknown, tree: SignalTree<T>) => void;
  onFinally?: (tree: SignalTree<T>) => void;
}

/**
 * Dev tools integration interface
 */
export interface DevToolsInterface<T> {
  connect: (treeName: string) => void;
  disconnect: () => void;
  send: (action: string, state: T) => void;
  isConnected: () => boolean;
}

/**
 * Main signal tree type that preserves hierarchical structure
 */
type SignalState<T> = T extends Record<string, unknown>
  ? DeepSignalify<T>
  : never;

/**
 * Main signal tree type with proper typing
 */
export type SignalTree<T> = {
  // The actual state under 'state' property
  state: SignalState<T>;
  // $ as an alias to state
  $: SignalState<T>;
} & {
  // Core API
  unwrap(): T;
  update(updater: (current: T) => Partial<T>): void;

  // Performance Features (always available - bypass when disabled)
  batchUpdate(updater: (current: T) => Partial<T>): void;
  computed<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;
  effect(fn: (tree: T) => void): void;
  subscribe(fn: (tree: T) => void): () => void;

  // Optimization methods (always available)
  optimize(): void;
  clearCache(): void;
  getMetrics(): PerformanceMetrics;

  // Middleware & Extensions (always available)
  addMiddleware(middleware: Middleware<T>): void;
  removeMiddleware(id: string): void;

  // Entity Management (always available)
  withEntityHelpers<E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E>;

  // Async Operations (always available)
  createAsyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult>
  ): (input: TInput) => Promise<TResult>;

  // Time Travel (always available - bypass when disabled)
  undo(): void;
  redo(): void;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;

  // Dev Tools (always available)
  __devTools?: DevToolsInterface<T>;
};

// ============================================
// EQUALITY FUNCTIONS
// ============================================

export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? isEqual(a, b) : a === b;
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        (a as Record<string, unknown>)[key] !==
        (b as Record<string, unknown>)[key]
      )
        return false;
    }
    return true;
  }

  return false;
}

// ============================================
// GLOBAL STATE - UPDATED WITH PER-TREE METRICS
// ============================================

const computedCache = new WeakMap<object, Map<string, Signal<unknown>>>();
const middlewareMap = new WeakMap<object, Array<Middleware<unknown>>>();
const timeTravelMap = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();
const redoStack = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();
const treeMetrics = new WeakMap<object, PerformanceMetrics>(); // ADDED THIS
const testSubscribers = new WeakMap<object, Array<(tree: unknown) => void>>(); // For test environment

// ============================================
// BATCHING SYSTEM
// ============================================

let updateQueue: Array<{ fn: () => void; startTime: number }> = [];
let isUpdating = false;

function batchUpdates(fn: () => void): void {
  const startTime = performance.now();
  updateQueue.push({ fn, startTime });

  if (!isUpdating) {
    isUpdating = true;
    queueMicrotask(() => {
      const queue = updateQueue.slice();
      updateQueue = [];
      isUpdating = false;

      queue.forEach(({ fn }) => fn());
    });
  }
}

// ============================================
// TIME TRAVEL MIDDLEWARE
// ============================================

function createTimeTravelMiddleware<T>(
  treeRef: object,
  maxEntries = 50
): Middleware<T> {
  return {
    id: 'timetravel',
    before: (action, payload, state) => {
      // Initialize history with the initial state if it doesn't exist
      if (
        !timeTravelMap.has(treeRef) &&
        action !== 'UNDO' &&
        action !== 'REDO'
      ) {
        const initialHistory: TimeTravelEntry<T>[] = [
          {
            state: structuredClone(state),
            timestamp: Date.now(),
            action: 'INITIAL',
            payload: undefined,
          },
        ];
        timeTravelMap.set(
          treeRef,
          initialHistory as TimeTravelEntry<unknown>[]
        );
      }
      return true;
    },
    after: (action, payload, state, newState) => {
      if (action !== 'UNDO' && action !== 'REDO') {
        let history =
          (timeTravelMap.get(treeRef) as TimeTravelEntry<T>[]) || [];

        history.push({
          state: structuredClone(newState),
          timestamp: Date.now(),
          action,
          payload: payload ? structuredClone(payload) : undefined,
        });

        if (history.length > maxEntries) {
          history = history.slice(-maxEntries);
        }

        timeTravelMap.set(treeRef, history as TimeTravelEntry<unknown>[]);
        redoStack.set(treeRef, [] as TimeTravelEntry<unknown>[]);
      }
    },
  };
}

// ============================================
// DEV TOOLS INTEGRATION
// ============================================

function createDevToolsInterface<T>(treeName: string): DevToolsInterface<T> {
  let devToolsConnection: {
    disconnect: () => void;
    send: (action: string, state: T) => void;
  } | null = null;

  return {
    connect: (name: string) => {
      if (
        typeof window !== 'undefined' &&
        '__REDUX_DEVTOOLS_EXTENSION__' in window
      ) {
        const devToolsExt = (window as unknown as Record<string, unknown>)[
          '__REDUX_DEVTOOLS_EXTENSION__'
        ] as {
          connect: (config: unknown) => {
            disconnect: () => void;
            send: (action: string, state: T) => void;
          };
        };

        devToolsConnection = devToolsExt.connect({
          name: name || treeName,
          features: {
            pause: true,
            lock: true,
            persist: true,
            export: true,
            import: 'custom',
            jump: true,
            skip: true,
            reorder: true,
            dispatch: true,
            test: true,
          },
        });
      }
    },

    disconnect: () => {
      if (devToolsConnection) {
        devToolsConnection.disconnect();
        devToolsConnection = null;
      }
    },

    send: (action: string, state: T) => {
      if (devToolsConnection) {
        devToolsConnection.send(action, state);
      }
    },

    isConnected: () => !!devToolsConnection,
  };
}

// ============================================
// ENTITY HELPERS
// ============================================

function createEntityHelpers<T, E extends { id: string | number }>(
  tree: SignalTree<T>,
  entityKey: keyof T
): EntityHelpers<E> {
  // Type assertion needed here due to generic constraints
  const entitySignal = (tree.state as Record<string, unknown>)[
    entityKey as string
  ] as WritableSignal<E[]>;

  return {
    add: (entity: E) => {
      entitySignal.update((entities) => [...entities, entity]);
    },

    update: (id: string | number, updates: Partial<E>) => {
      entitySignal.update((entities) =>
        entities.map((entity) =>
          entity.id === id ? { ...entity, ...updates } : entity
        )
      );
    },

    remove: (id: string | number) => {
      entitySignal.update((entities) =>
        entities.filter((entity) => entity.id !== id)
      );
    },

    upsert: (entity: E) => {
      entitySignal.update((entities) => {
        const index = entities.findIndex((e) => e.id === entity.id);
        if (index >= 0) {
          return entities.map((e, i) => (i === index ? entity : e));
        } else {
          return [...entities, entity];
        }
      });
    },

    findById: (id: string | number) =>
      computed(() => entitySignal().find((entity) => entity.id === id)),

    findBy: (predicate: (entity: E) => boolean) =>
      computed(() => entitySignal().filter(predicate)),

    selectIds: () => computed(() => entitySignal().map((entity) => entity.id)),

    selectAll: () => entitySignal,

    selectTotal: () => computed(() => entitySignal().length),
  };
}

// ============================================
// ASYNC ACTION FACTORY
// ============================================

function createAsyncActionFactory<T>(tree: SignalTree<T>) {
  return function createAsyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult> = {}
  ) {
    return async (input: TInput): Promise<TResult> => {
      const { loadingKey, errorKey, onSuccess, onError, onFinally } = config;

      // Helper function to set nested value
      const setNestedValue = (path: string, value: unknown) => {
        const keys = path.split('.');
        if (keys.length === 1) {
          tree.update((state) => ({ ...state, [path]: value } as Partial<T>));
        } else {
          tree.update((state) => {
            const newState = { ...state } as Record<string, unknown>;
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) {
              if (
                current[keys[i]] &&
                typeof current[keys[i]] === 'object' &&
                !Array.isArray(current[keys[i]])
              ) {
                // Only spread if it's a plain object
                if (
                  Object.prototype.toString.call(current[keys[i]]) ===
                    '[object Object]' &&
                  typeof current[keys[i]] === 'object' &&
                  current[keys[i]] !== null
                ) {
                  // Ensure the value is an object before spreading
                  current[keys[i]] = {
                    ...(current[keys[i]] as Record<string, unknown>),
                  };
                }
                current = current[keys[i]] as Record<string, unknown>;
              }
            }
            current[keys[keys.length - 1]] = value;
            return newState as Partial<T>;
          });
        }
      };

      // Set loading state
      if (loadingKey) {
        setNestedValue(loadingKey, true);
      }

      // Clear error state
      if (errorKey) {
        setNestedValue(errorKey, null);
      }

      try {
        const result = await operation(input);
        onSuccess?.(result, tree);
        return result;
      } catch (error) {
        if (errorKey) {
          setNestedValue(errorKey, error);
        }
        onError?.(error, tree);
        throw error;
      } finally {
        if (loadingKey) {
          setNestedValue(loadingKey, false);
        }
        onFinally?.(tree);
      }
    };
  };
}

// ============================================
// CORE TREE ENHANCEMENT
// ============================================

// Improved unwrap and update with better typing
function enhanceTreeBasic<T extends Record<string, unknown>>(
  tree: SignalTree<T>
): SignalTree<T> {
  tree.unwrap = (): T => {
    // Recursively unwrap with proper typing
    const unwrapObject = <O extends Record<string, unknown>>(
      obj: DeepSignalify<O>
    ): O => {
      const result = {} as Record<string, unknown>;

      for (const key in obj) {
        const value = obj[key];

        if (isSignal(value)) {
          result[key] = (value as Signal<unknown>)();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          // Nested signal state
          result[key] = unwrapObject(
            value as DeepSignalify<Record<string, unknown>>
          );
        } else {
          result[key] = value;
        }
      }

      return result as O;
    };

    return unwrapObject(tree.state as DeepSignalify<T>);
  };

  tree.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = tree.unwrap();
    const partialObj = updater(currentValue);

    // Recursively update with better typing
    const updateObject = <O extends Record<string, unknown>>(
      target: DeepSignalify<O>,
      updates: Partial<O>
    ): void => {
      for (const key in updates) {
        if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

        const updateValue = updates[key];
        const currentSignalOrState = (target as Record<string, unknown>)[key];

        if (isSignal(currentSignalOrState)) {
          // Direct signal update
          (currentSignalOrState as WritableSignal<unknown>).set(updateValue);
        } else if (
          typeof updateValue === 'object' &&
          updateValue !== null &&
          !Array.isArray(updateValue) &&
          typeof currentSignalOrState === 'object' &&
          currentSignalOrState !== null
        ) {
          // Nested object - recurse
          updateObject(
            currentSignalOrState as DeepSignalify<Record<string, unknown>>,
            updateValue as Partial<Record<string, unknown>>
          );
        }
      }
    };

    updateObject(tree.state as DeepSignalify<T>, partialObj);
  };

  // Add all required methods with bypass logic (will be overridden if enhanced)
  tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
    console.warn(
      '⚠️ batchUpdate() called but batching is not enabled.',
      '\nTo enable batch updates, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, batchUpdates: true })'
    );
    // Fallback: Just call update directly
    tree.update(updater);
  };

  tree.computed = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
    console.warn(
      '⚠️ computed() called but memoization is not enabled.',
      '\nTo enable memoized computations, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, useMemoization: true })'
    );
    // Fallback: Use simple Angular computed without memoization
    void cacheKey; // Mark as intentionally unused
    return computed(() => fn(tree.unwrap()));
  };

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      // Fallback for test environments without injection context
      console.warn('Effect requires Angular injection context', error);
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
      // Fallback for test environment - call once immediately
      console.warn('Subscribe requires Angular injection context', error);
      fn(tree.unwrap());
      return () => {
        // No-op unsubscribe
      };
    }
  };

  tree.optimize = () => {
    console.warn(
      '⚠️ optimize() called but performance optimization is not enabled.',
      '\nTo enable optimization features, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
  };

  tree.clearCache = () => {
    console.warn(
      '⚠️ clearCache() called but caching is not enabled.',
      '\nTo enable caching, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, useMemoization: true })'
    );
  };

  tree.getMetrics = (): PerformanceMetrics => {
    console.warn(
      '⚠️ getMetrics() called but performance tracking is not enabled.',
      '\nTo enable performance tracking, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, trackPerformance: true })'
    );
    // Return minimal metrics when tracking not enabled
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  };

  tree.addMiddleware = (middleware: Middleware<T>) => {
    console.warn(
      '⚠️ addMiddleware() called but performance features are not enabled.',
      '\nTo enable middleware support, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
    void middleware; // Mark as intentionally unused
  };

  tree.removeMiddleware = (id: string) => {
    console.warn(
      '⚠️ removeMiddleware() called but performance features are not enabled.',
      '\nTo enable middleware support, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
    void id; // Mark as intentionally unused
  };

  tree.withEntityHelpers = <E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E> => {
    // Always provide entity helpers - they're lightweight
    return createEntityHelpers<T, E>(tree, entityKey);
  };

  tree.createAsyncAction = <TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult> = {}
  ) => {
    // Always provide async actions - they're lightweight
    return createAsyncActionFactory(tree)(operation, config);
  };

  tree.undo = () => {
    console.warn(
      '⚠️ undo() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  tree.redo = () => {
    console.warn(
      '⚠️ redo() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  tree.getHistory = (): TimeTravelEntry<T>[] => {
    console.warn(
      '⚠️ getHistory() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
    return [];
  };

  tree.resetHistory = () => {
    console.warn(
      '⚠️ resetHistory() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  return tree;
}

function enhanceTree<T>(
  tree: SignalTree<T>,
  config: TreeConfig = {}
): SignalTree<T> {
  const {
    enablePerformanceFeatures = false,
    batchUpdates: useBatching = false,
    useMemoization = false,
    trackPerformance = false,
    maxCacheSize = 100,
    enableTimeTravel = false,
    enableDevTools = false,
    treeName = 'SignalTree',
  } = config;

  if (!enablePerformanceFeatures) {
    return tree; // Use bypass methods from enhanceTreeBasic
  }

  console.log(
    `🚀 Enhanced Signal Tree: "${treeName}" with performance features enabled`
  );

  middlewareMap.set(tree, []);

  // INITIALIZE PER-TREE METRICS
  if (trackPerformance) {
    const initialMetrics: PerformanceMetrics = {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
    treeMetrics.set(tree, initialMetrics);
  }

  if (enableTimeTravel) {
    const timeTravelMiddleware = createTimeTravelMiddleware<T>(tree);
    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(timeTravelMiddleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  }

  if (enableDevTools) {
    const devTools = createDevToolsInterface<T>(treeName);
    devTools.connect(treeName);
    tree.__devTools = devTools;

    const devToolsMiddleware: Middleware<T> = {
      id: 'devtools',
      after: (action, payload, state, newState) => {
        devTools.send(action, newState);
      },
    };

    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(devToolsMiddleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  }

  const originalUpdate = tree.update;
  tree.update = (updater: (current: T) => Partial<T>) => {
    const action = 'UPDATE';
    const currentState = tree.unwrap();

    // Calculate the update result to pass to middleware
    const updateResult = updater(currentState);

    const middlewares = middlewareMap.get(tree) || [];
    for (const middleware of middlewares) {
      if (
        middleware.before &&
        !middleware.before(action, updateResult, currentState) // Pass the actual update result
      ) {
        return; // Middleware blocked the update
      }
    }

    const updateFn = () => {
      const startTime = performance.now();
      originalUpdate.call(tree, updater);
      const endTime = performance.now();

      // Track metrics per tree
      const metrics = treeMetrics.get(tree);
      if (metrics) {
        metrics.updates++;
        const updateTime = endTime - startTime;
        metrics.averageUpdateTime =
          (metrics.averageUpdateTime * (metrics.updates - 1) + updateTime) /
          metrics.updates;
      }

      const newState = tree.unwrap();
      for (const middleware of middlewares) {
        if (middleware.after) {
          middleware.after(action, updateResult, currentState, newState);
        }
      }

      // Notify test subscribers if in test environment
      const subscribers = testSubscribers.get(tree);
      if (subscribers) {
        subscribers.forEach((subscriber) => {
          try {
            subscriber(newState);
          } catch (error) {
            // Ignore subscriber errors in test environment
            void error; // Mark as intentionally unused
          }
        });
      }
    };

    if (useBatching) {
      batchUpdates(updateFn);
    } else {
      updateFn();
    }
  };

  if (useBatching) {
    tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
      batchUpdates(() => tree.update(updater));
    };
  }

  if (useMemoization) {
    tree.computed = <R>(
      fn: (tree: T) => R,
      cacheKey = Math.random().toString()
    ): Signal<R> => {
      let cache = computedCache.get(tree);
      if (!cache) {
        cache = new Map();
        computedCache.set(tree, cache);
      }

      const metrics = treeMetrics.get(tree);

      if (cache.has(cacheKey)) {
        if (metrics) metrics.cacheHits++;
        const cachedSignal = cache.get(cacheKey);
        if (cachedSignal) {
          return cachedSignal as Signal<R>;
        }
      }

      if (metrics) metrics.cacheMisses++;
      const computedSignal = computed(() => {
        if (metrics) metrics.computations++;
        return fn(tree.unwrap());
      });

      cache.set(cacheKey, computedSignal);
      return computedSignal;
    };
  }

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      // Fallback for test environments without injection context
      console.warn('Effect requires Angular injection context', error);
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
      // Fallback for test environment - use subscriber tracking
      console.warn('Subscribe requires Angular injection context', error);
      const subscribers = testSubscribers.get(tree) || [];
      subscribers.push(fn as (tree: unknown) => void);
      testSubscribers.set(tree, subscribers);

      // Call immediately for initial subscription
      fn(tree.unwrap());

      // Return unsubscribe function
      return () => {
        const currentSubscribers = testSubscribers.get(tree) || [];
        const index = currentSubscribers.indexOf(fn as (tree: unknown) => void);
        if (index > -1) {
          currentSubscribers.splice(index, 1);
          testSubscribers.set(tree, currentSubscribers);
        }
      };
    }
  };

  tree.optimize = () => {
    const cache = computedCache.get(tree);
    if (cache && cache.size > maxCacheSize) {
      cache.clear();
    }

    if ('memory' in performance) {
      const metrics = treeMetrics.get(tree);
      if (metrics) {
        metrics.memoryUsage = (
          performance as { memory: { usedJSHeapSize: number } }
        ).memory.usedJSHeapSize;
      }
    }
  };

  tree.clearCache = () => {
    const cache = computedCache.get(tree);
    if (cache) {
      cache.clear();
    }
  };

  if (trackPerformance) {
    tree.getMetrics = () => {
      const metrics = treeMetrics.get(tree);
      const timeTravelEntries = timeTravelMap.get(tree)?.length || 0;
      return {
        ...(metrics || {
          updates: 0,
          computations: 0,
          cacheHits: 0,
          cacheMisses: 0,
          averageUpdateTime: 0,
        }),
        timeTravelEntries,
      };
    };
  }

  // Override methods when features are enabled

  // Always override addMiddleware and removeMiddleware when enhanced
  tree.addMiddleware = (middleware: Middleware<T>) => {
    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(middleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  };

  tree.removeMiddleware = (id: string) => {
    const middlewares = middlewareMap.get(tree) || [];
    const filtered = middlewares.filter((m) => m.id !== id);
    middlewareMap.set(tree, filtered);
  };

  // Always override these when enhanced since entity helpers are always useful
  tree.withEntityHelpers = <E extends { id: string | number }>(
    entityKey: keyof T
  ) => {
    return createEntityHelpers<T, E>(tree, entityKey);
  };

  tree.createAsyncAction = createAsyncActionFactory(tree);

  if (enableTimeTravel) {
    tree.undo = () => {
      const history = (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
      if (history.length > 1) {
        const currentEntry = history.pop();
        if (!currentEntry) return;

        const redoHistory = (redoStack.get(tree) as TimeTravelEntry<T>[]) || [];
        redoHistory.push(currentEntry);
        redoStack.set(tree, redoHistory as TimeTravelEntry<unknown>[]);

        const previousEntry = history[history.length - 1];
        if (previousEntry) {
          const action = 'UNDO';
          const currentState = tree.unwrap();

          const middlewares = middlewareMap.get(tree) || [];
          for (const middleware of middlewares) {
            if (
              middleware.id !== 'timetravel' &&
              middleware.before &&
              !middleware.before(action, previousEntry.state, currentState)
            ) {
              return;
            }
          }

          // Update tree directly without triggering middleware
          originalUpdate.call(tree, () => previousEntry.state as Partial<T>);

          const newState = tree.unwrap();
          for (const middleware of middlewares) {
            if (middleware.id !== 'timetravel' && middleware.after) {
              middleware.after(
                action,
                previousEntry.state,
                currentState,
                newState
              );
            }
          }
        }
      }
    };

    tree.redo = () => {
      const redoHistory = (redoStack.get(tree) as TimeTravelEntry<T>[]) || [];
      if (redoHistory.length > 0) {
        const redoEntry = redoHistory.pop();
        if (!redoEntry) return;

        redoStack.set(tree, redoHistory as TimeTravelEntry<unknown>[]);

        const action = 'REDO';
        const currentState = tree.unwrap();

        const middlewares = middlewareMap.get(tree) || [];
        for (const middleware of middlewares) {
          if (
            middleware.id !== 'timetravel' &&
            middleware.before &&
            !middleware.before(action, redoEntry.state, currentState)
          ) {
            return;
          }
        }

        // Update tree directly without triggering middleware
        originalUpdate.call(tree, () => redoEntry.state as Partial<T>);

        // Add the state back to history for future undo operations
        const history = (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
        history.push(redoEntry);
        timeTravelMap.set(tree, history as TimeTravelEntry<unknown>[]);

        const newState = tree.unwrap();
        for (const middleware of middlewares) {
          if (middleware.id !== 'timetravel' && middleware.after) {
            middleware.after(action, redoEntry.state, currentState, newState);
          }
        }
      }
    };

    tree.getHistory = () => {
      return (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
    };

    tree.resetHistory = () => {
      timeTravelMap.set(tree, []);
      redoStack.set(tree, []);
    };
  }

  return tree;
}

function create<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig = {}
): SignalTree<T> {
  const equalityFn = config.useShallowComparison ? shallowEqual : equal;

  // Recursively create signals for nested objects, but don't wrap them in trees
  const createSignalsFromObject = <O extends Record<string, unknown>>(
    obj: O
  ): DeepSignalify<O> => {
    const result = {} as DeepSignalify<O>;

    for (const [key, value] of Object.entries(obj)) {
      const isObj = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null;

      if (isObj(value) && !Array.isArray(value) && !isSignal(value)) {
        // For nested objects, create nested signal structure directly
        (result as Record<string, unknown>)[key] =
          createSignalsFromObject(value);
      } else if (isSignal(value)) {
        (result as Record<string, unknown>)[key] = value;
      } else {
        (result as Record<string, unknown>)[key] = signal(value, {
          equal: equalityFn,
        });
      }
    }

    return result;
  };

  // Create the signal structure
  const signalState = createSignalsFromObject(obj);

  const resultTree = {
    state: signalState,
    $: signalState, // $ points to the same state object
  } as SignalTree<T>;

  enhanceTreeBasic(resultTree);
  return enhanceTree(resultTree, config);
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Create a hierarchical signal tree tree
 *
 * @param obj - The initial state object
 * @returns A basic signal tree tree
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: T
): SignalTree<T>;

/**
 * Create a hierarchical signal tree tree with configuration
 *
 * @param obj - The initial state object
 * @param config - Configuration options for enhanced features
 * @returns A signal tree tree with enhanced features if enabled
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig
): SignalTree<T>;

// Implementation
export function signalTree<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig = {}
): SignalTree<T> {
  return create(obj, config);
}

// ============================================
// BUILT-IN MIDDLEWARE
// ============================================

export const loggingMiddleware = <T>(treeName: string): Middleware<T> => ({
  id: 'logging',
  before: (action, payload, state) => {
    console.group(`🏪 ${treeName}: ${action}`);
    console.log('Previous state:', state);
    console.log(
      'Payload:',
      typeof payload === 'function' ? 'Function' : payload
    );
    return true;
  },
  after: (action, payload, state, newState) => {
    console.log('New state:', newState);
    console.groupEnd();
  },
});

export const performanceMiddleware = <T>(): Middleware<T> => ({
  id: 'performance',
  before: (action) => {
    console.time(`Tree update: ${action}`);
    return true;
  },
  after: (action) => {
    console.timeEnd(`Tree update: ${action}`);
  },
});

export const validationMiddleware = <T>(
  validator: (state: T) => string | null
): Middleware<T> => ({
  id: 'validation',
  after: (action, payload, state, newState) => {
    const error = validator(newState);
    if (error) {
      console.error(`Validation failed after ${action}:`, error);
    }
  },
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function createEntityTree<E extends { id: string | number }>(
  initialEntities: E[] = [],
  config: TreeConfig = {}
) {
  const tree = signalTree(
    {
      entities: initialEntities,
      loading: false,
      error: null as string | null,
      selectedId: null as string | number | null,
    },
    {
      enablePerformanceFeatures: true,
      useMemoization: true,
      batchUpdates: true,
      ...config,
    }
  );

  if (!tree.withEntityHelpers) {
    throw new Error('Entity helpers not available');
  }
  const entityHelpers = tree.withEntityHelpers<E>('entities');

  return {
    ...tree,
    ...entityHelpers,

    select: (id: string | number) => {
      tree.state.selectedId.set(id);
    },

    deselect: () => {
      tree.state.selectedId.set(null);
    },

    getSelected: () =>
      computed(() => {
        const selectedId = tree.state.selectedId();
        return selectedId ? entityHelpers.findById(selectedId)() : undefined;
      }),

    loadAsync: (() => {
      if (!tree.createAsyncAction) {
        throw new Error('Async action creator not available');
      }
      return tree.createAsyncAction(
        async (loader: () => Promise<E[]>) => {
          const entities = await loader();
          return entities;
        },
        {
          loadingKey: 'loading',
          errorKey: 'error',
          onSuccess: (entities) => {
            tree.state.entities.set(entities);
          },
        }
      );
    })(),
  };
}

export type AsyncValidatorFn<T> = (
  value: T
) => Observable<string | null> | Promise<string | null>;

export type EnhancedArraySignal<T> = WritableSignal<T[]> & {
  push: (item: T) => void;
  removeAt: (index: number) => void;
  setAt: (index: number, value: T) => void;
  insertAt: (index: number, item: T) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
};

// ============================================
// FORM TREE TYPES
// ============================================

/**
 * Form tree type that flattens the state access while maintaining form-specific properties
 */
export type FormTree<T extends Record<string, unknown>> = {
  // Flattened state access - direct access to form values as signals
  state: DeepSignalify<T>;
  $: DeepSignalify<T>; // Alias for state

  // Form-specific signals
  errors: WritableSignal<Record<string, string>>;
  asyncErrors: WritableSignal<Record<string, string>>;
  touched: WritableSignal<Record<string, boolean>>;
  asyncValidating: WritableSignal<Record<string, boolean>>;
  dirty: WritableSignal<boolean>;
  valid: WritableSignal<boolean>;
  submitting: WritableSignal<boolean>;

  // Form methods
  unwrap(): T;
  setValue(field: string, value: unknown): void;
  setValues(values: Partial<T>): void;
  reset(): void;
  submit<TResult>(submitFn: (values: T) => Promise<TResult>): Promise<TResult>;
  validate(field?: string): Promise<void>;

  // Field-level helpers
  getFieldError(field: string): Signal<string | undefined>;
  getFieldAsyncError(field: string): Signal<string | undefined>;
  getFieldTouched(field: string): Signal<boolean | undefined>;
  isFieldValid(field: string): Signal<boolean>;
  isFieldAsyncValidating(field: string): Signal<boolean | undefined>;

  // Direct access to field errors
  fieldErrors: Record<string, Signal<string | undefined>>;
  fieldAsyncErrors: Record<string, Signal<string | undefined>>;

  // Keep values tree for backward compatibility
  values: SignalTree<T>;
};

export function createFormTree<T extends Record<string, unknown>>(
  initialValues: T,
  config: {
    validators?: Record<string, (value: unknown) => string | null>;
    asyncValidators?: Record<string, AsyncValidatorFn<unknown>>;
  } & TreeConfig = {}
): FormTree<T> {
  const { validators = {}, asyncValidators = {}, ...treeConfig } = config;

  // Create the underlying signal tree
  const valuesTree = signalTree(initialValues, treeConfig);

  // Ensure the state has the correct type - this is the key fix
  const flattenedState = valuesTree.state as DeepSignalify<T>;

  // Create form-specific signals
  const formSignals = {
    errors: signal<Record<string, string>>({}),
    asyncErrors: signal<Record<string, string>>({}),
    touched: signal<Record<string, boolean>>({}),
    asyncValidating: signal<Record<string, boolean>>({}),
    dirty: signal(false),
    valid: signal(true),
    submitting: signal(false),
  };

  const markDirty = () => formSignals.dirty.set(true);

  // Enhance arrays with natural operations
  const enhanceArray = <U>(
    arraySignal: WritableSignal<U[]>
  ): EnhancedArraySignal<U> => {
    const enhanced = arraySignal as EnhancedArraySignal<U>;

    enhanced.push = (item: U) => {
      arraySignal.update((arr) => [...arr, item]);
      markDirty();
    };

    enhanced.removeAt = (index: number) => {
      arraySignal.update((arr) => arr.filter((_, i) => i !== index));
      markDirty();
    };

    enhanced.setAt = (index: number, value: U) => {
      arraySignal.update((arr) =>
        arr.map((item, i) => (i === index ? value : item))
      );
      markDirty();
    };

    enhanced.insertAt = (index: number, item: U) => {
      arraySignal.update((arr) => [
        ...arr.slice(0, index),
        item,
        ...arr.slice(index),
      ]);
      markDirty();
    };

    enhanced.move = (from: number, to: number) => {
      arraySignal.update((arr) => {
        const newArr = [...arr];
        const [item] = newArr.splice(from, 1);
        if (item !== undefined) {
          newArr.splice(to, 0, item);
        }
        return newArr;
      });
      markDirty();
    };

    enhanced.clear = () => {
      arraySignal.set([]);
      markDirty();
    };

    return enhanced;
  };

  // Recursively enhance all arrays in the state
  const enhanceArraysRecursively = (obj: Record<string, unknown>): void => {
    for (const key in obj) {
      const value = obj[key];
      if (isSignal(value)) {
        const signalValue = (value as Signal<unknown>)();
        if (Array.isArray(signalValue)) {
          (obj as Record<string, unknown>)[key] = enhanceArray(
            value as WritableSignal<unknown[]>
          );
        }
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        enhanceArraysRecursively(value as Record<string, unknown>);
      }
    }
  };

  // Enhance arrays in the state
  enhanceArraysRecursively(flattenedState as Record<string, unknown>);

  // Helper functions for nested paths
  const getNestedValue = (obj: DeepSignalify<T>, path: string): unknown => {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
        if (isSignal(current)) {
          current = (current as Signal<unknown>)();
        }
      } else {
        return undefined;
      }
    }

    return current;
  };

  const setNestedValue = (path: string, value: unknown): void => {
    const keys = path.split('.');
    let current: unknown = flattenedState;

    for (let i = 0; i < keys.length - 1; i++) {
      current = (current as Record<string, unknown>)[keys[i]];
      if (!current) return;
    }

    const lastKey = keys[keys.length - 1];
    const target = (current as Record<string, unknown>)[lastKey];

    if (isSignal(target) && 'set' in target) {
      (target as WritableSignal<unknown>).set(value);
    }
  };

  const validate = async (field?: string): Promise<void> => {
    const errors: Record<string, string> = {};
    const asyncErrors: Record<string, string> = {};

    const fieldsToValidate = field ? [field] : Object.keys(validators);

    // Sync validation
    for (const fieldPath of fieldsToValidate) {
      const validator = validators[fieldPath];
      if (validator) {
        const value = getNestedValue(flattenedState, fieldPath);
        const error = validator(value);
        if (error) {
          errors[fieldPath] = error;
        }
      }
    }

    formSignals.errors.set(errors);

    // Async validation
    const asyncFieldsToValidate = field
      ? [field]
      : Object.keys(asyncValidators);

    for (const fieldPath of asyncFieldsToValidate) {
      const asyncValidator = asyncValidators[fieldPath];
      if (asyncValidator && (!field || field === fieldPath)) {
        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: true,
        }));

        try {
          const value = getNestedValue(flattenedState, fieldPath);
          const result = await asyncValidator(value);
          if (result && typeof result === 'string') {
            asyncErrors[fieldPath] = result;
          }
        } catch {
          asyncErrors[fieldPath] = 'Validation error';
        }

        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: false,
        }));
      }
    }

    formSignals.asyncErrors.set(asyncErrors);

    // Update validity
    const hasErrors = Object.keys(errors).length > 0;
    const hasAsyncErrors = Object.keys(asyncErrors).length > 0;
    const isValidating = Object.values(formSignals.asyncValidating()).some(
      (v) => v
    );

    formSignals.valid.set(!hasErrors && !hasAsyncErrors && !isValidating);
  };

  // Create computed signals for field errors
  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};

  // Create error signals for all defined validators
  [...Object.keys(validators), ...Object.keys(asyncValidators)].forEach(
    (fieldPath) => {
      fieldErrors[fieldPath] = computed(() => {
        const errors = formSignals.errors();
        return errors[fieldPath];
      });
      fieldAsyncErrors[fieldPath] = computed(() => {
        const errors = formSignals.asyncErrors();
        return errors[fieldPath];
      });
    }
  );

  // Create the form tree object
  const formTree: FormTree<T> = {
    // Flattened state access
    state: flattenedState,
    $: flattenedState,

    // Form signals
    ...formSignals,

    // Core methods
    unwrap: () => valuesTree.unwrap(),

    setValue: (field: string, value: unknown) => {
      setNestedValue(field, value);
      formSignals.touched.update((t) => ({ ...t, [field]: true }));
      markDirty();
      void validate(field);
    },

    setValues: (values: Partial<T>) => {
      valuesTree.update((v) => ({ ...v, ...values }));
      markDirty();
      void validate();
    },

    reset: () => {
      // Reset each field individually to maintain signal reactivity
      const resetSignals = <TReset extends Record<string, unknown>>(
        current: DeepSignalify<TReset>,
        initial: TReset
      ): void => {
        for (const [key, initialValue] of Object.entries(initial)) {
          const currentValue = (current as Record<string, unknown>)[key];

          if (isSignal(currentValue) && 'set' in currentValue) {
            (currentValue as WritableSignal<unknown>).set(initialValue);
          } else if (
            typeof initialValue === 'object' &&
            initialValue !== null &&
            !Array.isArray(initialValue) &&
            typeof currentValue === 'object' &&
            currentValue !== null &&
            !isSignal(currentValue)
          ) {
            resetSignals(
              currentValue as DeepSignalify<Record<string, unknown>>,
              initialValue as Record<string, unknown>
            );
          }
        }
      };

      resetSignals(flattenedState, initialValues);

      formSignals.errors.set({});
      formSignals.asyncErrors.set({});
      formSignals.touched.set({});
      formSignals.asyncValidating.set({});
      formSignals.dirty.set(false);
      formSignals.valid.set(true);
      formSignals.submitting.set(false);
    },

    submit: async <TResult>(
      submitFn: (values: T) => Promise<TResult>
    ): Promise<TResult> => {
      formSignals.submitting.set(true);

      try {
        await validate();

        if (!formSignals.valid()) {
          throw new Error('Form is invalid');
        }

        const currentValues = valuesTree.unwrap();
        const result = await submitFn(currentValues);
        return result;
      } finally {
        formSignals.submitting.set(false);
      }
    },

    validate,

    // Field helpers
    getFieldError: (field: string) =>
      fieldErrors[field] || computed(() => undefined),

    getFieldAsyncError: (field: string) =>
      fieldAsyncErrors[field] || computed(() => undefined),

    getFieldTouched: (field: string) =>
      computed(() => {
        const touched = formSignals.touched();
        return touched[field];
      }),

    isFieldValid: (field: string) =>
      computed(() => {
        const errors = formSignals.errors();
        const asyncErrors = formSignals.asyncErrors();
        const asyncValidating = formSignals.asyncValidating();
        return !errors[field] && !asyncErrors[field] && !asyncValidating[field];
      }),

    isFieldAsyncValidating: (field: string) =>
      computed(() => {
        const asyncValidating = formSignals.asyncValidating();
        return asyncValidating[field];
      }),

    // Direct access
    fieldErrors,
    fieldAsyncErrors,

    // Keep values tree for backward compatibility
    values: valuesTree,
  };

  return formTree;
}

export function createTestTree<T extends Record<string, unknown>>(
  initialState: T,
  config: TreeConfig = {}
): SignalTree<T> & {
  setState: (state: Partial<T>) => void;
  getState: () => T;
  getHistory: () => TimeTravelEntry<T>[];
  expectState: (expectedState: Partial<T>) => void;
} {
  const tree = signalTree(initialState, {
    enablePerformanceFeatures: true,
    enableTimeTravel: true,
    enableDevTools: false,
    trackPerformance: true,
    ...config,
  });

  return {
    ...tree,

    setState: (state: Partial<T>) => {
      tree.update(() => state);
    },

    getState: () => tree.unwrap(),

    getHistory: () => {
      if (!tree.getHistory) {
        throw new Error('Time travel not enabled for this tree');
      }
      return tree.getHistory();
    },

    expectState: (expectedState: Partial<T>) => {
      const currentState = tree.unwrap();
      for (const [key, value] of Object.entries(expectedState)) {
        const currentValue = (currentState as Record<string, unknown>)[key];
        if (!isEqual(currentValue, value)) {
          throw new Error(
            `Expected ${key} to be ${JSON.stringify(
              value
            )}, but got ${JSON.stringify(currentValue)}`
          );
        }
      }
    },
  };
}

// ============================================
// ANGULAR FORM INTEGRATION
// ============================================

/**
 * Simple directive for two-way binding with signals
 */
@Directive({
  selector: '[libSignalValue]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SignalValueDirective),
      multi: true,
    },
  ],
  standalone: true,
})
export class SignalValueDirective implements ControlValueAccessor, OnInit {
  @Input() signalValue!: WritableSignal<unknown>;
  @Output() signalValueChange = new EventEmitter<unknown>();

  private elementRef = inject(ElementRef);
  private renderer = inject(Renderer2);

  private onChange: (value: unknown) => void = () => {
    // Empty implementation for ControlValueAccessor
  };
  private onTouched: () => void = () => {
    // Empty implementation for ControlValueAccessor
  };

  ngOnInit() {
    effect(() => {
      const value = this.signalValue();
      this.renderer.setProperty(this.elementRef.nativeElement, 'value', value);
    });
  }

  @HostListener('input', ['$event'])
  @HostListener('change', ['$event'])
  handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target?.value;
    if (value !== undefined) {
      this.signalValue.set(value);
      this.signalValueChange.emit(value);
      this.onChange(value);
    }
  }

  @HostListener('blur')
  handleBlur() {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    if (value !== undefined) {
      this.signalValue.set(value);
    }
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.renderer.setProperty(
      this.elementRef.nativeElement,
      'disabled',
      isDisabled
    );
  }
}

// ============================================
// SIMPLE AUDIT TRAIL
// ============================================

export interface AuditEntry<T = unknown> {
  timestamp: number;
  changes: Partial<T>;
  metadata?: {
    userId?: string;
    source?: string;
    description?: string;
  };
}

export function createAuditMiddleware<T>(
  auditLog: AuditEntry<T>[],
  getMetadata?: () => AuditEntry<T>['metadata']
): Middleware<T> {
  return {
    id: 'audit',
    after: (action: string, payload: unknown, oldState: T, newState: T) => {
      const changes = getChanges(oldState, newState);
      if (Object.keys(changes).length > 0) {
        auditLog.push({
          timestamp: Date.now(),
          changes,
          metadata: getMetadata?.(),
        });
      }
    },
  };
}

function getChanges<T>(oldState: T, newState: T): Partial<T> {
  const changes: Record<string, unknown> = {};

  for (const key in newState) {
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes as Partial<T>;
}

// ============================================
// COMMON VALIDATORS
// ============================================

export const validators = {
  required:
    (message = 'Required') =>
    (value: unknown) =>
      !value ? message : null,

  email:
    (message = 'Invalid email') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !strValue.includes('@') ? message : null;
    },

  minLength: (min: number) => (value: unknown) => {
    const strValue = value as string;
    return strValue && strValue.length < min ? `Min ${min} characters` : null;
  },

  pattern:
    (regex: RegExp, message = 'Invalid format') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !regex.test(strValue) ? message : null;
    },
};

export const asyncValidators = {
  unique:
    (
      checkFn: (value: unknown) => Promise<boolean>,
      message = 'Already exists'
    ) =>
    async (value: unknown) => {
      if (!value) return null;
      const exists = await checkFn(value);
      return exists ? message : null;
    },
};

// ============================================
// OPTIONAL RXJS BRIDGE
// ============================================

export function toObservable<T>(signal: Signal<T>): Observable<T> {
  return new Observable((subscriber) => {
    try {
      const effectRef = effect(() => {
        subscriber.next(signal());
      });
      return () => effectRef.destroy();
    } catch {
      // Fallback for test environment without injection context
      subscriber.next(signal());
      return () => {
        // No cleanup needed for single emission
      };
    }
  });
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [SignalValueDirective];
