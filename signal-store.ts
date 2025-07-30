import { 
  Signal, WritableSignal, isSignal, signal, computed, effect, inject, DestroyRef,
  Directive, Input, Output, EventEmitter, forwardRef, ElementRef, Renderer2,
  HostListener, OnInit
} from '@angular/core';
import { 
  ControlValueAccessor, NG_VALUE_ACCESSOR
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, from, of } from 'rxjs';
import isEqual from 'lodash-es/isEqual';

// ============================================
// CORE TYPES AND INTERFACES
// ============================================

export type SimpleSignalValue = string | number | boolean;

export type SignalValue<T> =
  T extends ArrayLike<SimpleSignalValue>
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
  payload?: any;
}

/**
 * Middleware interface for intercepting store operations
 */
export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: any, state: T) => boolean;
  after?: (action: string, payload: any, state: T, newState: T) => void;
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
  onError?: (error: any, store: SignalStore<T>) => void;
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
  withEntityHelpers?: <E extends { id: string | number }>(entityKey: keyof T) => EntityHelpers<E>;
  
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
    const keysA = Object.keys(a as any);
    const keysB = Object.keys(b as any);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if ((a as any)[key] !== (b as any)[key]) return false;
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
  averageUpdateTime: 0
};

const computedCache = new WeakMap<any, Map<string, any>>();
const middlewareMap = new WeakMap<any, Middleware<any>[]>();
const timeTravelMap = new WeakMap<any, TimeTravelEntry<any>[]>();
const redoStack = new WeakMap<any, TimeTravelEntry<any>[]>();

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
        (globalMetrics.averageUpdateTime * (globalMetrics.updates - 1) + totalTime) / globalMetrics.updates;
    });
  }
}

// ============================================
// TIME TRAVEL MIDDLEWARE
// ============================================

function createTimeTravelMiddleware<T>(maxEntries: number = 50): Middleware<T> {
  return {
    id: 'timetravel',
    before: (action, payload, state) => {
      const store = state as any;
      let history = timeTravelMap.get(store) || [];
      
      if (action !== 'UNDO' && action !== 'REDO') {
        history.push({
          state: structuredClone(state),
          timestamp: Date.now(),
          action,
          payload: payload ? structuredClone(payload) : undefined
        });
        
        if (history.length > maxEntries) {
          history = history.slice(-maxEntries);
        }
        
        timeTravelMap.set(store, history);
        redoStack.set(store, []);
      }
      
      return true;
    }
  };
}

// ============================================
// DEV TOOLS INTEGRATION
// ============================================

function createDevToolsInterface<T>(storeName: string): DevToolsInterface<T> {
  let devToolsConnection: any = null;
  
  return {
    connect: (name: string) => {
      if (typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__) {
        devToolsConnection = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect({
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
            test: true
          }
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
    
    isConnected: () => !!devToolsConnection
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
      entitySignal.update(entities => [...entities, entity]);
    },
    
    update: (id: string | number, updates: Partial<E>) => {
      entitySignal.update(entities =>
        entities.map(entity =>
          entity.id === id ? { ...entity, ...updates } : entity
        )
      );
    },
    
    remove: (id: string | number) => {
      entitySignal.update(entities =>
        entities.filter(entity => entity.id !== id)
      );
    },
    
    upsert: (entity: E) => {
      entitySignal.update(entities => {
        const index = entities.findIndex(e => e.id === entity.id);
        if (index >= 0) {
          return entities.map((e, i) => i === index ? entity : e);
        } else {
          return [...entities, entity];
        }
      });
    },
    
    findById: (id: string | number) => computed(() => 
      entitySignal().find(entity => entity.id === id)
    ),
    
    findBy: (predicate: (entity: E) => boolean) => computed(() =>
      entitySignal().filter(predicate)
    ),
    
    selectIds: () => computed(() => 
      entitySignal().map(entity => entity.id)
    ),
    
    selectAll: () => entitySignal,
    
    selectTotal: () => computed(() => entitySignal().length)
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
      
      // Set loading state
      if (loadingKey) {
        const keys = loadingKey.split('.');
        if (keys.length === 1) {
          store.update(state => ({ ...state, [loadingKey]: true } as Partial<T>));
        } else {
          store.update(state => {
            const newState = { ...state };
            let current: any = newState;
            for (let i = 0; i < keys.length - 1; i++) {
              current[keys[i]] = { ...current[keys[i]] };
              current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = true;
            return newState;
          });
        }
      }
      
      // Clear error state
      if (errorKey) {
        const keys = errorKey.split('.');
        if (keys.length === 1) {
          store.update(state => ({ ...state, [errorKey]: null } as Partial<T>));
        } else {
          store.update(state => {
            const newState = { ...state };
            let current: any = newState;
            for (let i = 0; i < keys.length - 1; i++) {
              current[keys[i]] = { ...current[keys[i]] };
              current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = null;
            return newState;
          });
        }
      }
      
      try {
        const result = await operation(input);
        onSuccess?.(result, store);
        return result;
      } catch (error) {
        if (errorKey) {
          const keys = errorKey.split('.');
          if (keys.length === 1) {
            store.update(state => ({ ...state, [errorKey]: error } as Partial<T>));
          } else {
            store.update(state => {
              const newState = { ...state };
              let current: any = newState;
              for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = { ...current[keys[i]] };
                current = current[keys[i]];
              }
              current[keys[keys.length - 1]] = error;
              return newState;
            });
          }
        }
        onError?.(error, store);
        throw error;
      } finally {
        if (loadingKey) {
          const keys = loadingKey.split('.');
          if (keys.length === 1) {
            store.update(state => ({ ...state, [loadingKey]: false } as Partial<T>));
          } else {
            store.update(state => {
              const newState = { ...state };
              let current: any = newState;
              for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = { ...current[keys[i]] };
                current = current[keys[i]];
              }
              current[keys[keys.length - 1]] = false;
              return newState;
            });
          }
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
    const unwrappedObject: any = {};

    for (const key in store) {
      const value = store[key as keyof SignalStore<T>];

      if (isSignal(value)) {
        unwrappedObject[key] = value();
      } else if (typeof value === 'object' && value !== null && typeof (value as any).unwrap === 'function') {
        const nestedUnwrapped = (value as SignalStore<any>).unwrap();
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
        (storeValue as WritableSignal<any>).set(partialValue);
      } else if (
        typeof storeValue === 'object' &&
        storeValue !== null &&
        partialValue !== null &&
        typeof partialValue === 'object'
      ) {
        (storeValue as SignalStore<any>).update(() => partialValue as any);
      }
    }
  };

  return store;
}

function enhanceStore<T>(store: SignalStore<T>, config: StoreConfig = {}): SignalStore<T> {
  const {
    enablePerformanceFeatures = false,
    batchUpdates: useBatching = false,
    useMemoization = false,
    trackPerformance = false,
    useShallowComparison = false,
    maxCacheSize = 100,
    enableTimeTravel = false,
    enableDevTools = false,
    storeName = 'SignalStore'
  } = config;

  if (!enablePerformanceFeatures) {
    return store;
  }

  console.log(`🚀 Enhanced Signal Store: "${storeName}" with performance features enabled`);

  middlewareMap.set(store, []);

  if (enableTimeTravel) {
    const timeTravelMiddleware = createTimeTravelMiddleware<T>();
    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(timeTravelMiddleware);
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
      }
    };
    
    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(devToolsMiddleware);
    middlewareMap.set(store, middlewares);
  }

  const originalUpdate = store.update;
  store.update = (updater: (current: T) => Partial<T>) => {
    const action = 'UPDATE';
    const currentState = store.unwrap();
    
    const middlewares = middlewareMap.get(store) || [];
    for (const middleware of middlewares) {
      if (middleware.before && !middleware.before(action, updater, currentState)) {
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
    store.computed = <R>(fn: (store: T) => R, cacheKey = Math.random().toString()): Signal<R> => {
      let cache = computedCache.get(store);
      if (!cache) {
        cache = new Map();
        computedCache.set(store, cache);
      }
      
      if (cache.has(cacheKey)) {
        globalMetrics.cacheHits++;
        return cache.get(cacheKey);
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
      globalMetrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
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
        timeTravelEntries
      };
    };
  }

  store.addMiddleware = (middleware: Middleware<T>) => {
    const middlewares = middlewareMap.get(store) || [];
    middlewares.push(middleware);
    middlewareMap.set(store, middlewares);
  };

  store.removeMiddleware = (id: string) => {
    const middlewares = middlewareMap.get(store) || [];
    const filtered = middlewares.filter(m => m.id !== id);
    middlewareMap.set(store, filtered);
  };

  store.withEntityHelpers = <E extends { id: string | number }>(entityKey: keyof T) => {
    return createEntityHelpers<T, E>(store, entityKey);
  };

  store.createAsyncAction = createAsyncActionFactory(store);

  if (enableTimeTravel) {
    store.undo = () => {
      const history = timeTravelMap.get(store) || [];
      if (history.length > 1) {
        const currentEntry = history.pop()!;
        let redoHistory = redoStack.get(store) || [];
        redoHistory.push(currentEntry);
        redoStack.set(store, redoHistory);
        
        const previousEntry = history[history.length - 1];
        if (previousEntry) {
          const action = 'UNDO';
          const currentState = store.unwrap();
          
          const middlewares = middlewareMap.get(store) || [];
          for (const middleware of middlewares) {
            if (middleware.id !== 'timetravel' && middleware.before && !middleware.before(action, previousEntry.state, currentState)) {
              return;
            }
          }
          
          store.update(() => previousEntry.state as Partial<T>);
          
          const newState = store.unwrap();
          for (const middleware of middlewares) {
            if (middleware.id !== 'timetravel' && middleware.after) {
              middleware.after(action, previousEntry.state, currentState, newState);
            }
          }
        }
      }
    };

    store.redo = () => {
      const redoHistory = redoStack.get(store) || [];
      if (redoHistory.length > 0) {
        const redoEntry = redoHistory.pop()!;
        redoStack.set(store, redoHistory);
        
        const action = 'REDO';
        const currentState = store.unwrap();
        
        const middlewares = middlewareMap.get(store) || [];
        for (const middleware of middlewares) {
          if (middleware.id !== 'timetravel' && middleware.before && !middleware.before(action, redoEntry.state, currentState)) {
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
      return timeTravelMap.get(store) || [];
    };

    store.resetHistory = () => {
      timeTravelMap.set(store, []);
      redoStack.set(store, []);
    };
  }

  return store;
}

function create<T, P extends keyof T>(
  obj: Required<T> | { [K in keyof T]: SignalValue<T[K]> | SignalStore<T[K]> },
  config: StoreConfig = {}
): SignalStore<T> {
  const store: Partial<SignalStore<T>> = {};
  const equalityFn = config.useShallowComparison ? shallowEqual : equal;
  
  for (const [key, value] of Object.entries(obj)) {
    const isObj = (v: any) => typeof v === 'object' && v !== null;

    store[key as P] = (
      isObj(value) && !Array.isArray(value) && !isSignal(value)
        ? create(value as any, config)
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
export function signalStore<T>(obj: Required<T>): SignalStore<Required<T>> {
  return create<Required<T>, keyof Required<T>>(obj, { enablePerformanceFeatures: false });
}

/**
 * Create an enhanced signal store with performance features
 */
export function enhancedSignalStore<T>(
  obj: Required<T>,
  config: StoreConfig = {}
): SignalStore<Required<T>> {
  return create<Required<T>, keyof Required<T>>(obj, { 
    enablePerformanceFeatures: true, 
    ...config 
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
    console.log('Payload:', typeof payload === 'function' ? 'Function' : payload);
    return true;
  },
  after: (action, payload, state, newState) => {
    console.log('New state:', newState);
    console.groupEnd();
  }
});

export const performanceMiddleware = <T>(): Middleware<T> => ({
  id: 'performance',
  before: (action) => {
    console.time(`Store update: ${action}`);
    return true;
  },
  after: (action) => {
    console.timeEnd(`Store update: ${action}`);
  }
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
  }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function createEntityStore<E extends { id: string | number }>(
  initialEntities: E[] = [],
  config: StoreConfig = {}
) {
  const store = enhancedSignalStore({
    entities: initialEntities,
    loading: false,
    error: null as string | null,
    selectedId: null as string | number | null
  }, {
    enablePerformanceFeatures: true,
    useMemoization: true,
    batchUpdates: true,
    ...config
  });

  const entityHelpers = store.withEntityHelpers!<E>('entities');

  return {
    ...store,
    ...entityHelpers,
    
    select: (id: string | number) => {
      store.selectedId!.set(id);
    },
    
    deselect: () => {
      store.selectedId!.set(null);
    },
    
    getSelected: () => computed(() => {
      const selectedId = store.selectedId!();
      return selectedId ? entityHelpers.findById(selectedId)() : undefined;
    }),
    
    loadAsync: store.createAsyncAction!(
      async (loader: () => Promise<E[]>) => {
        const entities = await loader();
        return entities;
      },
      {
        loadingKey: 'loading',
        errorKey: 'error',
        onSuccess: (entities) => {
          store.entities.set(entities);
        }
      }
    )
  };
}

export type AsyncValidatorFn<T> = (value: T) => Observable<string | null> | Promise<string | null>;

export type EnhancedArraySignal<T> = WritableSignal<T[]> & {
  push: (item: T) => void;
  removeAt: (index: number) => void;
  setAt: (index: number, value: T) => void;
  insertAt: (index: number, item: T) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
};

export function createFormStore<T extends Record<string, any>>(
  initialValues: T,
  config: {
    validators?: Record<string, (value: any) => string | null>;
    asyncValidators?: Record<string, AsyncValidatorFn<any>>;
  } & StoreConfig = {}
) {
  const { validators = {}, asyncValidators = {}, ...storeConfig } = config;
  
  const store = enhancedSignalStore({
    values: initialValues,
    errors: {} as Record<string, string>,
    asyncErrors: {} as Record<string, string>,
    touched: {} as Record<string, boolean>,
    asyncValidating: {} as Record<string, boolean>,
    dirty: false,
    valid: true,
    submitting: false
  }, {
    batchUpdates: true,
    useMemoization: true,
    storeName: 'FormStore',
    ...storeConfig
  });

  // Enhance arrays with natural operations
  const enhanceArray = <U>(arraySignal: WritableSignal<U[]>): EnhancedArraySignal<U> => {
    const enhanced = arraySignal as EnhancedArraySignal<U>;

    enhanced.push = (item: U) => {
      arraySignal.update(arr => [...arr, item]);
      markDirty();
    };

    enhanced.removeAt = (index: number) => {
      arraySignal.update(arr => arr.filter((_, i) => i !== index));
      markDirty();
    };

    enhanced.setAt = (index: number, value: U) => {
      arraySignal.update(arr => arr.map((item, i) => i === index ? value : item));
      markDirty();
    };

    enhanced.insertAt = (index: number, item: U) => {
      arraySignal.update(arr => [...arr.slice(0, index), item, ...arr.slice(index)]);
      markDirty();
    };

    enhanced.move = (from: number, to: number) => {
      arraySignal.update(arr => {
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

  // Recursively enhance all arrays
  const enhanceArraysRecursively = (obj: any) => {
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (isSignal(value) && Array.isArray(value())) {
        obj[key] = enhanceArray(value as WritableSignal<any[]>);
      } else if (typeof value === 'object' && value !== null && !isSignal(value)) {
        enhanceArraysRecursively(value);
      }
    });
  };

  enhanceArraysRecursively(store.values);

  const markDirty = () => store.dirty.set(true);

  // Helper functions for nested paths
  const getNestedValue = (obj: any, path: string): any => {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
        if (isSignal(current)) {
          current = current();
        }
      } else {
        return undefined;
      }
    }
    
    return current;
  };

  const setNestedValue = (path: string, value: any) => {
    const keys = path.split('.');
    
    if (keys.length === 1) {
      const signal = store.values[keys[0]];
      if (isSignal(signal)) {
        signal.set(value);
      }
    } else {
      let current: any = store.values;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      if (isSignal(current[keys[keys.length - 1]])) {
        current[keys[keys.length - 1]].set(value);
      }
    }
  };

  const validate = async (field?: string) => {
    const values = store.values.unwrap();
    const errors: Record<string, string> = {};
    const asyncErrors: Record<string, string> = {};
    
    const fieldsToValidate = field ? [field] : Object.keys(validators);

    // Sync validation
    for (const fieldPath of fieldsToValidate) {
      const validator = validators[fieldPath];
      if (validator) {
        const value = getNestedValue(values, fieldPath);
        const error = validator(value);
        if (error) {
          errors[fieldPath] = error;
        }
      }
    }

    store.errors.set(errors);

    // Async validation
    const asyncFieldsToValidate = field ? [field] : Object.keys(asyncValidators);
    
    for (const fieldPath of asyncFieldsToValidate) {
      const asyncValidator = asyncValidators[fieldPath];
      if (asyncValidator && (!field || field === fieldPath)) {
        store.asyncValidating.update(v => ({ ...v, [fieldPath]: true }));
        
        try {
          const value = getNestedValue(values, fieldPath);
          const result = await asyncValidator(value);
          if (result) {
            asyncErrors[fieldPath] = result;
          }
        } catch (error) {
          asyncErrors[fieldPath] = 'Validation error';
        }
        
        store.asyncValidating.update(v => ({ ...v, [fieldPath]: false }));
      }
    }

    store.asyncErrors.set(asyncErrors);

    // Update validity
    const hasErrors = Object.keys(errors).length > 0;
    const hasAsyncErrors = Object.keys(asyncErrors).length > 0;
    const isValidating = Object.values(store.asyncValidating()).some(v => v);
    
    store.valid.set(!hasErrors && !hasAsyncErrors && !isValidating);
  };

  // Create computed signals for field errors
  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};
  
  // Create error signals for all defined validators
  [...Object.keys(validators), ...Object.keys(asyncValidators)].forEach(fieldPath => {
    fieldErrors[fieldPath] = computed(() => store.errors()[fieldPath]);
    fieldAsyncErrors[fieldPath] = computed(() => store.asyncErrors()[fieldPath]);
  });

  return {
    ...store,
    
    setValue: (field: string, value: any) => {
      setNestedValue(field, value);
      store.touched.update(t => ({ ...t, [field]: true }));
      markDirty();
      validate(field);
    },

    setValues: (values: Partial<T>) => {
      store.values.update(v => ({ ...v, ...values }));
      markDirty();
      validate();
    },

    reset: () => {
      store.update(() => ({
        values: initialValues,
        errors: {},
        asyncErrors: {},
        touched: {},
        asyncValidating: {},
        dirty: false,
        valid: true,
        submitting: false
      }));
    },

    submit: async (submitFn: (values: T) => Promise<any>) => {
      store.submitting.set(true);
      
      try {
        await validate();
        
        if (!store.valid()) {
          throw new Error('Form is invalid');
        }
        
        const result = await submitFn(store.values.unwrap());
        return result;
      } finally {
        store.submitting.set(false);
      }
    },

    validate,
    
    // Convenience methods
    getFieldError: (field: string) => fieldErrors[field] || computed(() => undefined),
    getFieldAsyncError: (field: string) => fieldAsyncErrors[field] || computed(() => undefined),
    getFieldTouched: (field: string) => computed(() => store.touched()[field]),
    isFieldValid: (field: string) => computed(() => 
      !store.errors()[field] && !store.asyncErrors()[field] && !store.asyncValidating()[field]
    ),
    isFieldAsyncValidating: (field: string) => computed(() => store.asyncValidating()[field]),
    
    // Keep the direct access too
    fieldErrors,
    fieldAsyncErrors
  };
}

export function createTestStore<T>(
  initialState: T,
  config: StoreConfig = {}
): SignalStore<T> & {
  setState: (state: Partial<T>) => void;
  getState: () => T;
  getHistory: () => TimeTravelEntry<T>[];
  expectState: (expectedState: Partial<T>) => void;
} {
  const store = enhancedSignalStore(initialState as Required<T>, {
    enableTimeTravel: true,
    enableDevTools: false,
    trackPerformance: true,
    ...config
  });

  return {
    ...store,
    
    setState: (state: Partial<T>) => {
      store.update(() => state);
    },
    
    getState: () => store.unwrap(),
    
    getHistory: () => store.getHistory!(),
    
    expectState: (expectedState: Partial<T>) => {
      const currentState = store.unwrap();
      for (const [key, value] of Object.entries(expectedState)) {
        if (!isEqual((currentState as any)[key], value)) {
          throw new Error(`Expected ${key} to be ${JSON.stringify(value)}, but got ${JSON.stringify((currentState as any)[key])}`);
        }
      }
    }
  };
}

// ============================================
// ANGULAR FORM INTEGRATION (NEW)
// ============================================

/**
 * Simple directive for two-way binding with signals
 */
@Directive({
  selector: '[signalValue]',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SignalValueDirective),
    multi: true
  }],
  standalone: true
})
export class SignalValueDirective implements ControlValueAccessor, OnInit {
  @Input() signalValue!: WritableSignal<any>;
  @Output() signalValueChange = new EventEmitter<any>();
  
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  
  constructor(
    private elementRef: ElementRef,
    private renderer: Renderer2
  ) {}
  
  ngOnInit() {
    effect(() => {
      const value = this.signalValue();
      this.renderer.setProperty(this.elementRef.nativeElement, 'value', value);
    });
  }
  
  @HostListener('input', ['$event.target.value'])
  @HostListener('change', ['$event.target.value'])
  handleChange(value: any) {
    this.signalValue.set(value);
    this.signalValueChange.emit(value);
    this.onChange(value);
  }
  
  @HostListener('blur')
  handleBlur() {
    this.onTouched();
  }
  
  writeValue(value: any): void {
    if (value !== undefined) {
      this.signalValue.set(value);
    }
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }
  
  setDisabledState?(isDisabled: boolean): void {
    this.renderer.setProperty(this.elementRef.nativeElement, 'disabled', isDisabled);
  }
}

// ============================================
// SIMPLE AUDIT TRAIL (NEW)
// ============================================

export interface AuditEntry<T = any> {
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
    after: (action: string, payload: any, oldState: T, newState: T) => {
      const changes = getChanges(oldState, newState);
      if (Object.keys(changes).length > 0) {
        auditLog.push({
          timestamp: Date.now(),
          changes,
          metadata: getMetadata?.()
        });
      }
    }
  };
}

function getChanges<T>(oldState: T, newState: T): Partial<T> {
  const changes: any = {};
  
  for (const key in newState) {
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }
  
  return changes;
}

// ============================================
// COMMON VALIDATORS (NEW)
// ============================================

export const validators = {
  required: (message = 'Required') => 
    (value: any) => !value ? message : null,
    
  email: (message = 'Invalid email') => 
    (value: string) => value && !value.includes('@') ? message : null,
    
  minLength: (min: number) => 
    (value: string) => value && value.length < min ? `Min ${min} characters` : null,
    
  pattern: (regex: RegExp, message = 'Invalid format') => 
    (value: string) => value && !regex.test(value) ? message : null
};

export const asyncValidators = {
  unique: (checkFn: (value: any) => Promise<boolean>, message = 'Already exists') => 
    async (value: any) => {
      if (!value) return null;
      const exists = await checkFn(value);
      return exists ? message : null;
    }
};

// ============================================
// OPTIONAL RXJS BRIDGE (NEW)
// ============================================

export function toObservable<T>(signal: Signal<T>): Observable<T> {
  return new Observable(subscriber => {
    const effectRef = effect(() => {
      subscriber.next(signal());
    });
    
    return () => effectRef.destroy();
  });
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [
  SignalValueDirective
];

export type {
  SignalStore,
  StoreConfig,
  PerformanceMetrics,
  TimeTravelEntry,
  Middleware,
  EntityHelpers,
  AsyncActionConfig,
  DevToolsInterface,
  AuditEntry,
  AsyncValidatorFn,
  EnhancedArraySignal
};
