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
import { Observable } from 'rxjs';
import isEqual from 'lodash-es/isEqual';

// ============================================
// CORE TYPES AND INTERFACES
// ============================================

export type SimpleSignalValue = string | number | boolean;

export type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

/**
 * Configuration options for creating signal stores
 */
export interface StoreConfig {
  enablePerformanceFeatures?: boolean;
  batchUpdates?: boolean;
  useMemoization?: boolean;
  trackPerformance?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  enableTimeTravel?: boolean;
  enableDevTools?: boolean;
  storeName?: string;
}

/**
 * Performance metrics tracked by the store
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
 * Middleware interface for intercepting store operations
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
  onSuccess?: (result: TResult, store: SignalStore<T>) => void;
  onError?: (error: unknown, store: SignalStore<T>) => void;
  onFinally?: (store: SignalStore<T>) => void;
}

/**
 * Dev tools integration interface
 */
export interface DevToolsInterface<T> {
  connect: (storeName: string) => void;
  disconnect: () => void;
  send: (action: string, state: T) => void;
  isConnected: () => boolean;
}

/**
 * Main signal store type that preserves hierarchical structure
 */
export type SignalStore<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK>
      : SignalStore<T[K]>
    : WritableSignal<T[K]>;
} & {
  // Core API
  unwrap(): T;
  update(updater: (current: T) => Partial<T>): void;

  // Performance Features (optional)
  batchUpdate?: (updater: (current: T) => Partial<T>) => void;
  computed?: <R>(fn: (store: T) => R, cacheKey?: string) => Signal<R>;
  effect?: (fn: (store: T) => void) => void;
  subscribe?: (fn: (store: T) => void) => () => void;

  // Optimization methods
  optimize?: () => void;
  clearCache?: () => void;
  getMetrics?: () => PerformanceMetrics;

  // Middleware & Extensions
  addMiddleware?: (middleware: Middleware<T>) => void;
  removeMiddleware?: (id: string) => void;

  // Entity Management
  withEntityHelpers?: <E extends { id: string | number }>(
    entityKey: keyof T
  ) => EntityHelpers<E>;

  // Async Operations
  createAsyncAction?: <TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult>
  ) => (input: TInput) => Promise<TResult>;

  // Time Travel (optional)
  undo?: () => void;
  redo?: () => void;
  getHistory?: () => TimeTravelEntry<T>[];
  resetHistory?: () => void;

  // Dev Tools
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
// GLOBAL STATE
// ============================================

const globalMetrics: PerformanceMetrics = {
  updates: 0,
  computations: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageUpdateTime: 0,
};

const computedCache = new WeakMap<object, Map<string, Signal<unknown>>>();
const middlewareMap = new WeakMap<object, Array<Middleware<unknown>>>();
const timeTravelMap = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();
const redoStack = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();

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

      const totalStart = performance.now();
      queue.forEach(({ fn }) => fn());
      const totalTime = performance.now() - totalStart;

      globalMetrics.updates++;
      globalMetrics.averageUpdateTime =
        (globalMetrics.averageUpdateTime * (globalMetrics.updates - 1) +
          totalTime) /
        globalMetrics.updates;
    });
  }
}

// ============================================
// TIME TRAVEL MIDDLEWARE
// ============================================

function createTimeTravelMiddleware<T>(maxEntries = 50): Middleware<T> {
  return {
    id: 'timetravel',
    before: (action, payload, state) => {
      const store = state as object;
      let history = (timeTravelMap.get(store) as TimeTravelEntry<T>[]) || [];

      if (action !== 'UNDO' && action !== 'REDO') {
        history.push({
          state: structuredClone(state),
          timestamp: Date.now(),
          action,
          payload: payload ? structuredClone(payload) : undefined,
        });

        if (history.length > maxEntries) {
          history = history.slice(-maxEntries);
        }

        timeTravelMap.set(store, history as TimeTravelEntry<unknown>[]);
        redoStack.set(store, [] as TimeTravelEntry<unknown>[]);
      }

      return true;
    },
  };
}

// ============================================
// DEV TOOLS INTEGRATION
// ============================================

function createDevToolsInterface<T>(storeName: string): DevToolsInterface<T> {
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
          name: name || storeName,
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
  store: SignalStore<T>,
  entityKey: keyof T
): EntityHelpers<E> {
  const entitySignal = store[entityKey] as WritableSignal<E[]>;

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

function createAsyncActionFactory<T>(store: SignalStore<T>) {
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
          store.update((state) => ({ ...state, [path]: value } as Partial<T>));
        } else {
          store.update((state) => {
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
        onSuccess?.(result, store);
        return result;
      } catch (error) {
        if (errorKey) {
          setNestedValue(errorKey, error);
        }
        onError?.(error, store);
        throw error;
      } finally {
        if (loadingKey) {
          setNestedValue(loadingKey, false);
        }
        onFinally?.(store);
      }
    };
  };
}

// ============================================
// CORE STORE ENHANCEMENT
// ============================================

function enhanceStoreBasic<T>(store: SignalStore<T>): SignalStore<T> {
  store.unwrap = () => {
    const unwrappedObject: Record<string, unknown> = {};

    for (const key in store) {
      const value = store[key as keyof SignalStore<T>];

      if (isSignal(value)) {
        unwrappedObject[key] = value();
      } else if (
        typeof value === 'object' &&
        value !== null &&
        'unwrap' in value &&
        typeof value.unwrap === 'function'
      ) {
        const nestedUnwrapped = (value as SignalStore<unknown>).unwrap();
        unwrappedObject[key] = nestedUnwrapped;
      } else if (typeof value !== 'function') {
        unwrappedObject[key] = value;
      }
    }

    return unwrappedObject as T;
  };

  store.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = store.unwrap();
    const partialObj = updater(currentValue);

    for (const key in partialObj) {
      if (!Object.prototype.hasOwnProperty.call(partialObj, key)) continue;

      const partialValue = partialObj[key];
      const storeValue = store[key as keyof SignalStore<T>];

      if (isSignal(storeValue)) {
        (storeValue as WritableSignal<unknown>).set(partialValue);
      } else if (
        typeof storeValue === 'object' &&
        storeValue !== null &&
        partialValue !== null &&
        typeof partialValue === 'object' &&
        'update' in storeValue &&
        typeof storeValue.update === 'function'
      ) {
        (storeValue as SignalStore<unknown>).update(
          () => partialValue as Partial<unknown>
        );
      }
    }
  };

  return store;
}

function enhanceStore<T>(
  store: SignalStore<T>,
  config: StoreConfig = {}
): SignalStore<T> {
  const {
    enablePerformanceFeatures = false,
    batchUpdates: useBatching = false,
    useMemoization = false,
    trackPerformance = false,
    maxCacheSize = 100,
    enableTimeTravel = false,
    enableDevTools = false,
    storeName = 'SignalStore',
  } = config;

  if (!enablePerformanceFeatures) {
    return store;
  }

  console.log(
    `🚀 Enhanced Signal Store: "${storeName}" with performance features enabled`
  );

  middlewareMap.set(store, []);

  if (enableTimeTravel) {
    const timeTravelMiddleware = createTimeTravelMiddleware<T>();
    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(timeTravelMiddleware as Middleware<unknown>);
    middlewareMap.set(store, middlewares);
  }

  if (enableDevTools) {
    const devTools = createDevToolsInterface<T>(storeName);
    devTools.connect(storeName);
    store.__devTools = devTools;

    const devToolsMiddleware: Middleware<T> = {
      id: 'devtools',
      after: (action, payload, state, newState) => {
        devTools.send(action, newState);
      },
    };

    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(devToolsMiddleware as Middleware<unknown>);
    middlewareMap.set(store, middlewares);
  }

  const originalUpdate = store.update;
  store.update = (updater: (current: T) => Partial<T>) => {
    const action = 'UPDATE';
    const currentState = store.unwrap();

    const middlewares = middlewareMap.get(store) || [];
    for (const middleware of middlewares) {
      if (
        middleware.before &&
        !middleware.before(action, updater, currentState)
      ) {
        return;
      }
    }

    const updateFn = () => {
      originalUpdate.call(store, updater);

      const newState = store.unwrap();
      for (const middleware of middlewares) {
        if (middleware.after) {
          middleware.after(action, updater, currentState, newState);
        }
      }
    };

    if (useBatching) {
      batchUpdates(updateFn);
    } else {
      updateFn();
    }
  };

  if (useBatching) {
    store.batchUpdate = (updater: (current: T) => Partial<T>) => {
      batchUpdates(() => store.update(updater));
    };
  }

  if (useMemoization) {
    store.computed = <R>(
      fn: (store: T) => R,
      cacheKey = Math.random().toString()
    ): Signal<R> => {
      let cache = computedCache.get(store);
      if (!cache) {
        cache = new Map();
        computedCache.set(store, cache);
      }

      if (cache.has(cacheKey)) {
        globalMetrics.cacheHits++;
        const cachedSignal = cache.get(cacheKey);
        if (cachedSignal) {
          return cachedSignal as Signal<R>;
        }
      }

      globalMetrics.cacheMisses++;
      const computedSignal = computed(() => {
        globalMetrics.computations++;
        return fn(store.unwrap());
      });

      cache.set(cacheKey, computedSignal);
      return computedSignal;
    };
  }

  store.effect = (fn: (store: T) => void) => {
    effect(() => fn(store.unwrap()));
  };

  store.subscribe = (fn: (store: T) => void): (() => void) => {
    const destroyRef = inject(DestroyRef);
    let isDestroyed = false;

    const effectRef = effect(() => {
      if (!isDestroyed) {
        fn(store.unwrap());
      }
    });

    const unsubscribe = () => {
      isDestroyed = true;
      effectRef.destroy();
    };

    destroyRef.onDestroy(unsubscribe);
    return unsubscribe;
  };

  store.optimize = () => {
    const cache = computedCache.get(store);
    if (cache && cache.size > maxCacheSize) {
      cache.clear();
    }

    if ('memory' in performance) {
      globalMetrics.memoryUsage = (
        performance as { memory: { usedJSHeapSize: number } }
      ).memory.usedJSHeapSize;
    }
  };

  store.clearCache = () => {
    const cache = computedCache.get(store);
    if (cache) {
      cache.clear();
    }
  };

  if (trackPerformance) {
    store.getMetrics = () => {
      const timeTravelEntries = timeTravelMap.get(store)?.length || 0;
      return {
        ...globalMetrics,
        timeTravelEntries,
      };
    };
  }

  store.addMiddleware = (middleware: Middleware<T>) => {
    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(middleware as Middleware<unknown>);
    middlewareMap.set(store, middlewares);
  };

  store.removeMiddleware = (id: string) => {
    const middlewares = middlewareMap.get(store) || [];
    const filtered = middlewares.filter((m) => m.id !== id);
    middlewareMap.set(store, filtered);
  };

  store.withEntityHelpers = <E extends { id: string | number }>(
    entityKey: keyof T
  ) => {
    return createEntityHelpers<T, E>(store, entityKey);
  };

  store.createAsyncAction = createAsyncActionFactory(store);

  if (enableTimeTravel) {
    store.undo = () => {
      const history = (timeTravelMap.get(store) as TimeTravelEntry<T>[]) || [];
      if (history.length > 1) {
        const currentEntry = history.pop();
        if (!currentEntry) return;

        const redoHistory =
          (redoStack.get(store) as TimeTravelEntry<T>[]) || [];
        redoHistory.push(currentEntry);
        redoStack.set(store, redoHistory as TimeTravelEntry<unknown>[]);

        const previousEntry = history[history.length - 1];
        if (previousEntry) {
          const action = 'UNDO';
          const currentState = store.unwrap();

          const middlewares = middlewareMap.get(store) || [];
          for (const middleware of middlewares) {
            if (
              middleware.id !== 'timetravel' &&
              middleware.before &&
              !middleware.before(action, previousEntry.state, currentState)
            ) {
              return;
            }
          }

          store.update(() => previousEntry.state as Partial<T>);

          const newState = store.unwrap();
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

    store.redo = () => {
      const redoHistory = (redoStack.get(store) as TimeTravelEntry<T>[]) || [];
      if (redoHistory.length > 0) {
        const redoEntry = redoHistory.pop();
        if (!redoEntry) return;

        redoStack.set(store, redoHistory as TimeTravelEntry<unknown>[]);

        const action = 'REDO';
        const currentState = store.unwrap();

        const middlewares = middlewareMap.get(store) || [];
        for (const middleware of middlewares) {
          if (
            middleware.id !== 'timetravel' &&
            middleware.before &&
            !middleware.before(action, redoEntry.state, currentState)
          ) {
            return;
          }
        }

        store.update(() => redoEntry.state as Partial<T>);

        const newState = store.unwrap();
        for (const middleware of middlewares) {
          if (middleware.id !== 'timetravel' && middleware.after) {
            middleware.after(action, redoEntry.state, currentState, newState);
          }
        }
      }
    };

    store.getHistory = () => {
      return (timeTravelMap.get(store) as TimeTravelEntry<T>[]) || [];
    };

    store.resetHistory = () => {
      timeTravelMap.set(store, []);
      redoStack.set(store, []);
    };
  }

  return store;
}

function create<T extends Record<string, unknown>, P extends keyof T>(
  obj: T,
  config: StoreConfig = {}
): SignalStore<T> {
  const store: Partial<SignalStore<T>> = {};
  const equalityFn = config.useShallowComparison ? shallowEqual : equal;

  for (const [key, value] of Object.entries(obj)) {
    const isObj = (v: unknown) => typeof v === 'object' && v !== null;

    store[key as P] = (
      isObj(value) && !Array.isArray(value) && !isSignal(value)
        ? create(value as Record<string, unknown>, config)
        : isSignal(value)
        ? value
        : (signal(value, { equal: equalityFn }) as SignalStore<T>[P])
    ) as SignalStore<T>[P];
  }

  const resultStore = store as SignalStore<T>;

  enhanceStoreBasic(resultStore);

  return enhanceStore(resultStore, config);
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Create a basic hierarchical signal store
 */
export function signalStore<T extends Record<string, unknown>>(
  obj: T
): SignalStore<T> {
  return create<T, keyof T>(obj, {
    enablePerformanceFeatures: false,
  });
}

/**
 * Create an enhanced signal store with performance features
 */
export function enhancedSignalStore<T extends Record<string, unknown>>(
  obj: T,
  config: StoreConfig = {}
): SignalStore<T> {
  return create<T, keyof T>(obj, {
    enablePerformanceFeatures: true,
    ...config,
  });
}

// ============================================
// BUILT-IN MIDDLEWARE
// ============================================

export const loggingMiddleware = <T>(storeName: string): Middleware<T> => ({
  id: 'logging',
  before: (action, payload, state) => {
    console.group(`🏪 ${storeName}: ${action}`);
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
    console.time(`Store update: ${action}`);
    return true;
  },
  after: (action) => {
    console.timeEnd(`Store update: ${action}`);
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

export function createEntityStore<E extends { id: string | number }>(
  initialEntities: E[] = [],
  config: StoreConfig = {}
) {
  const store = enhancedSignalStore(
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

  if (!store.withEntityHelpers) {
    throw new Error('Entity helpers not available');
  }
  const entityHelpers = store.withEntityHelpers<E>('entities');

  return {
    ...store,
    ...entityHelpers,

    select: (id: string | number) => {
      store.selectedId.set(id);
    },

    deselect: () => {
      store.selectedId.set(null);
    },

    getSelected: () =>
      computed(() => {
        const selectedId = store.selectedId();
        return selectedId ? entityHelpers.findById(selectedId)() : undefined;
      }),

    loadAsync: (() => {
      if (!store.createAsyncAction) {
        throw new Error('Async action creator not available');
      }
      return store.createAsyncAction(
        async (loader: () => Promise<E[]>) => {
          const entities = await loader();
          return entities;
        },
        {
          loadingKey: 'loading',
          errorKey: 'error',
          onSuccess: (entities) => {
            store.entities.set(entities);
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

export function createFormStore<T extends Record<string, unknown>>(
  initialValues: T,
  config: {
    validators?: Record<string, (value: unknown) => string | null>;
    asyncValidators?: Record<string, AsyncValidatorFn<unknown>>;
  } & StoreConfig = {}
) {
  const { validators = {}, asyncValidators = {}, ...storeConfig } = config;

  // Create the store with proper signal types
  const store = {
    values: signalStore(initialValues),
    errors: signal<Record<string, string>>({}),
    asyncErrors: signal<Record<string, string>>({}),
    touched: signal<Record<string, boolean>>({}),
    asyncValidating: signal<Record<string, boolean>>({}),
    dirty: signal(false),
    valid: signal(true),
    submitting: signal(false),
  };

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
        newArr.splice(to, 0, item);
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

  // Recursively enhance all arrays in the values
  const enhanceArraysRecursively = (obj: Record<string, unknown>) => {
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (isSignal(value) && Array.isArray((value as Signal<unknown>)())) {
        obj[key] = enhanceArray(value as WritableSignal<unknown[]>);
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !isSignal(value)
      ) {
        enhanceArraysRecursively(value as Record<string, unknown>);
      }
    });
  };

  // Only enhance arrays if the unwrap method exists
  const valuesUnwrapped =
    'unwrap' in store.values && typeof store.values.unwrap === 'function'
      ? store.values.unwrap()
      : store.values;

  if (typeof valuesUnwrapped === 'object' && valuesUnwrapped !== null) {
    enhanceArraysRecursively(valuesUnwrapped as Record<string, unknown>);
  }

  const markDirty = () => store.dirty.set(true);

  // Helper functions for nested paths
  const getNestedValue = (
    obj: Record<string, unknown>,
    path: string
  ): unknown => {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
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

  const setNestedValue = (path: string, value: unknown) => {
    const keys = path.split('.');

    if (keys.length === 1) {
      const signal = (store.values as Record<string, unknown>)[keys[0]];
      if (
        isSignal(signal) &&
        'set' in signal &&
        typeof signal.set === 'function'
      ) {
        (signal as WritableSignal<unknown>).set(value);
      }
    } else {
      let current: unknown = store.values;
      for (let i = 0; i < keys.length - 1; i++) {
        current = (current as Record<string, unknown>)[keys[i]];
      }
      const finalSignal = (current as Record<string, unknown>)[
        keys[keys.length - 1]
      ];
      if (
        isSignal(finalSignal) &&
        'set' in finalSignal &&
        typeof finalSignal.set === 'function'
      ) {
        (finalSignal as WritableSignal<unknown>).set(value);
      }
    }
  };

  const validate = async (field?: string) => {
    const values =
      'unwrap' in store.values && typeof store.values.unwrap === 'function'
        ? store.values.unwrap()
        : store.values;
    const errors: Record<string, string> = {};
    const asyncErrors: Record<string, string> = {};

    const fieldsToValidate = field ? [field] : Object.keys(validators);

    // Sync validation
    for (const fieldPath of fieldsToValidate) {
      const validator = validators[fieldPath];
      if (validator) {
        const value = getNestedValue(
          values as Record<string, unknown>,
          fieldPath
        );
        const error = validator(value);
        if (error) {
          errors[fieldPath] = error;
        }
      }
    }

    store.errors.set(errors);

    // Async validation
    const asyncFieldsToValidate = field
      ? [field]
      : Object.keys(asyncValidators);

    for (const fieldPath of asyncFieldsToValidate) {
      const asyncValidator = asyncValidators[fieldPath];
      if (asyncValidator && (!field || field === fieldPath)) {
        store.asyncValidating.update((v) => ({ ...v, [fieldPath]: true }));

        try {
          const value = getNestedValue(
            values as Record<string, unknown>,
            fieldPath
          );
          const result = await asyncValidator(value);
          if (result && typeof result === 'string') {
            asyncErrors[fieldPath] = result;
          }
        } catch {
          asyncErrors[fieldPath] = 'Validation error';
        }

        store.asyncValidating.update((v) => ({ ...v, [fieldPath]: false }));
      }
    }

    store.asyncErrors.set(asyncErrors);

    // Update validity
    const hasErrors = Object.keys(errors).length > 0;
    const hasAsyncErrors = Object.keys(asyncErrors).length > 0;
    const isValidating = Object.values(store.asyncValidating()).some((v) => v);

    store.valid.set(!hasErrors && !hasAsyncErrors && !isValidating);
  };

  // Create computed signals for field errors
  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};

  // Create error signals for all defined validators
  [...Object.keys(validators), ...Object.keys(asyncValidators)].forEach(
    (fieldPath) => {
      fieldErrors[fieldPath] = computed(() => {
        const errors = store.errors();
        return errors[fieldPath];
      });
      fieldAsyncErrors[fieldPath] = computed(() => {
        const errors = store.asyncErrors();
        return errors[fieldPath];
      });
    }
  );

  return {
    ...store,

    setValue: (field: string, value: unknown) => {
      setNestedValue(field, value);
      store.touched.update((t) => ({ ...t, [field]: true }));
      markDirty();
      validate(field);
    },

    setValues: (values: Partial<T>) => {
      store.values.update((v) => ({ ...v, ...values }));
      markDirty();
      validate();
    },

    reset: () => {
      store.values = signalStore(initialValues);
      store.errors.set({});
      store.asyncErrors.set({});
      store.touched.set({});
      store.asyncValidating.set({});
      store.dirty.set(false);
      store.valid.set(true);
      store.submitting.set(false);
    },

    submit: async (submitFn: (values: T) => Promise<unknown>) => {
      store.submitting.set(true);

      try {
        await validate();

        if (!store.valid()) {
          throw new Error('Form is invalid');
        }

        const currentValues =
          'unwrap' in store.values && typeof store.values.unwrap === 'function'
            ? store.values.unwrap()
            : store.values;
        const result = await submitFn(currentValues as T);
        return result;
      } finally {
        store.submitting.set(false);
      }
    },

    validate,

    // Convenience methods
    getFieldError: (field: string) =>
      fieldErrors[field] || computed(() => undefined),
    getFieldAsyncError: (field: string) =>
      fieldAsyncErrors[field] || computed(() => undefined),
    getFieldTouched: (field: string) =>
      computed(() => {
        const touched = store.touched();
        return touched[field];
      }),
    isFieldValid: (field: string) =>
      computed(() => {
        const errors = store.errors();
        const asyncErrors = store.asyncErrors();
        const asyncValidating = store.asyncValidating();
        return !errors[field] && !asyncErrors[field] && !asyncValidating[field];
      }),
    isFieldAsyncValidating: (field: string) =>
      computed(() => {
        const asyncValidating = store.asyncValidating();
        return asyncValidating[field];
      }),

    // Keep the direct access too
    fieldErrors,
    fieldAsyncErrors,

    // Expose the signals directly
    values: store.values,
    errors: store.errors,
    asyncErrors: store.asyncErrors,
    touched: store.touched,
    asyncValidating: store.asyncValidating,
    dirty: store.dirty,
    valid: store.valid,
    submitting: store.submitting,
  };
}

export function createTestStore<T extends Record<string, unknown>>(
  initialState: T,
  config: StoreConfig = {}
): SignalStore<T> & {
  setState: (state: Partial<T>) => void;
  getState: () => T;
  getHistory: () => TimeTravelEntry<T>[];
  expectState: (expectedState: Partial<T>) => void;
} {
  const store = enhancedSignalStore(initialState, {
    enableTimeTravel: true,
    enableDevTools: false,
    trackPerformance: true,
    ...config,
  });

  return {
    ...store,

    setState: (state: Partial<T>) => {
      store.update(() => state);
    },

    getState: () => store.unwrap(),

    getHistory: () => {
      if (!store.getHistory) {
        throw new Error('Time travel not enabled for this store');
      }
      return store.getHistory();
    },

    expectState: (expectedState: Partial<T>) => {
      const currentState = store.unwrap();
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
    (value: string) =>
      value && !value.includes('@') ? message : null,

  minLength: (min: number) => (value: string) =>
    value && value.length < min ? `Min ${min} characters` : null,

  pattern:
    (regex: RegExp, message = 'Invalid format') =>
    (value: string) =>
      value && !regex.test(value) ? message : null,
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
    const effectRef = effect(() => {
      subscriber.next(signal());
    });

    return () => effectRef.destroy();
  });
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [SignalValueDirective];
