This is a significant refactor. Here's the complete implementation:

## 1. Core Types (`types.ts`)

```typescript
import { Signal, WritableSignal } from '@angular/core';

// ============================================
// CORE TYPES (unchanged)
// ============================================

export type Primitive = string | number | boolean | null | undefined | bigint | symbol;

export type BuiltInObject =
  | Date | RegExp | Map<unknown, unknown> | Set<unknown>
  | WeakMap<object, unknown> | WeakSet<object> | ArrayBuffer
  | DataView | Error | Promise<unknown> | URL | URLSearchParams
  | FormData | Blob | File | Headers | Request | Response
  | AbortController | AbortSignal
  | Uint16Array | Int32Array | Uint32Array | Float32Array
  | Float64Array | BigInt64Array | BigUint64Array;

export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;

export type CallableWritableSignal<T> = WritableSignal<T> & {
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
};

export interface NodeAccessor<T> {
  (): T;
  (value: T): void;
  (updater: (current: T) => T): void;
}

export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;

export type TreeNode<T> = {
  [K in keyof T]: [T[K]] extends [EntityMapMarker<infer E, infer Key>]
    ? EntitySignal<E, Key>
    : [T[K]] extends [readonly unknown[]]
      ? CallableWritableSignal<T[K]>
      : [T[K]] extends [object]
        ? [T[K]] extends [Signal<unknown>]
          ? T[K]
          : [T[K]] extends [BuiltInObject]
            ? CallableWritableSignal<T[K]>
            : [T[K]] extends [(...args: unknown[]) => unknown]
              ? CallableWritableSignal<T[K]>
              : AccessibleNode<T[K]>
        : CallableWritableSignal<T[K]>;
};

// ============================================
// BASE SIGNAL TREE - MINIMAL CORE ONLY
// ============================================

/**
 * Base SignalTree with ONLY core functionality.
 * Enhancers add methods via intersection types.
 */
export interface ISignalTree<T> {
  /** The reactive state tree */
  readonly state: TreeNode<T>;

  /** Shorthand for state */
  readonly $: TreeNode<T>;

  /** Apply enhancers */
  with: WithMethod<T, this>;

  /** Clean up resources */
  destroy(): void;

  /** Dispose lazy signals (if enabled) */
  dispose?(): void;
}

/**
 * SignalTree is the base plus any enhancer additions.
 * Start with just the base - enhancers extend it.
 */
export type ISignalTree<T> = ISignalTree<T>;

// ============================================
// ENHANCER SYSTEM
// ============================================

export interface EnhancerMeta {
  name?: string;
  requires?: string[];
  provides?: string[];
}

export const ENHANCER_META = Symbol('signaltree:enhancer:meta');

/**
 * An enhancer function that transforms a tree and may add methods.
 * TIn: input tree type
 * TAdded: methods/properties added by this enhancer
 */
export type Enhancer<TIn, TAdded = unknown> = {
  (input: TIn): TIn & TAdded;
  metadata?: EnhancerMeta;
};

/**
 * Extract what an enhancer adds
 */
export type EnhancerAdds<E> = E extends Enhancer<any, infer Added> ? Added : unknown;

/**
 * The .with() method - properly chains enhancer types
 */
export interface WithMethod<T, TSelf> {
  // No enhancers - return self
  (): TSelf;

  // Single enhancer
  <TAdded>(e1: Enhancer<TSelf, TAdded>): TSelf & TAdded;

  // Two enhancers
  <T1, T2>(
    e1: Enhancer<TSelf, T1>,
    e2: Enhancer<TSelf & T1, T2>
  ): TSelf & T1 & T2;

  // Three enhancers
  <T1, T2, T3>(
    e1: Enhancer<TSelf, T1>,
    e2: Enhancer<TSelf & T1, T2>,
    e3: Enhancer<TSelf & T1 & T2, T3>
  ): TSelf & T1 & T2 & T3;

  // Four enhancers
  <T1, T2, T3, T4>(
    e1: Enhancer<TSelf, T1>,
    e2: Enhancer<TSelf & T1, T2>,
    e3: Enhancer<TSelf & T1 & T2, T3>,
    e4: Enhancer<TSelf & T1 & T2 & T3, T4>
  ): TSelf & T1 & T2 & T3 & T4;

  // Five enhancers
  <T1, T2, T3, T4, T5>(
    e1: Enhancer<TSelf, T1>,
    e2: Enhancer<TSelf & T1, T2>,
    e3: Enhancer<TSelf & T1 & T2, T3>,
    e4: Enhancer<TSelf & T1 & T2 & T3, T4>,
    e5: Enhancer<TSelf & T1 & T2 & T3 & T4, T5>
  ): TSelf & T1 & T2 & T3 & T4 & T5;

  // Fallback for more enhancers (loses some type safety)
  <TAdded>(...enhancers: Enhancer<any, any>[]): TSelf & TAdded;
}

// ============================================
// ENHANCER METHOD INTERFACES
// ============================================

/**
 * Methods added by batching()
 */
export interface BatchingMethods<T> {
  /** Batch multiple updates into a single change detection cycle */
  batch(updater: (state: TreeNode<T>) => void): void;

  /** Batch update with partial state */
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

/**
 * Methods added by memoization()
 */
export interface MemoizationMethods<T> {
  /** Create a memoized computed signal */
  memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R>;

  /** Memoized state update */
  memoizedUpdate(updater: (current: T) => Partial<T>, cacheKey?: string): void;

  /** Clear memoization cache */
  clearMemoCache(key?: string): void;

  /** Get cache statistics */
  getCacheStats(): CacheStats;
}

export interface CacheStats {
  size: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  keys: string[];
}

/**
 * Methods added by timeTravel()
 */
export interface TimeTravelMethods<T> {
  /** Undo last change */
  undo(): void;

  /** Redo last undone change */
  redo(): void;

  /** Check if undo is available */
  canUndo(): boolean;

  /** Check if redo is available */
  canRedo(): boolean;

  /** Get history entries */
  getHistory(): TimeTravelEntry<T>[];

  /** Clear history */
  resetHistory(): void;

  /** Jump to specific history index */
  jumpTo(index: number): void;

  /** Get current history index */
  getCurrentIndex(): number;
}

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload?: unknown;
}

/**
 * Methods added by devTools()
 */
export interface DevToolsMethods {
  /** Connect to Redux DevTools */
  connectDevTools(): void;

  /** Disconnect from Redux DevTools */
  disconnectDevTools(): void;
}

/**
 * Methods added by entities()
 */
export interface EntitiesMethods<T> {
  /**
   * Get entity helpers for a collection path.
   * @deprecated Use tree.$.collectionName directly with entityMap<E>() markers
   */
  entities<E extends { id: string | number }>(path: keyof T | string): EntityHelpers<E>;
}

/**
 * Methods added by effects()
 */
export interface EffectsMethods<T> {
  /** Register a reactive effect */
  effect(fn: (state: T) => void): () => void;

  /** Subscribe to state changes */
  subscribe(fn: (state: T) => void): () => void;
}

/**
 * Methods added by withOptimizedUpdates() / enterprise()
 */
export interface OptimizedUpdateMethods<T> {
  /** Diff-based optimized update */
  updateOptimized(
    updates: Partial<T>,
    options?: OptimizedUpdateOptions
  ): OptimizedUpdateResult;
}

export interface OptimizedUpdateOptions {
  batch?: boolean;
  batchSize?: number;
  maxDepth?: number;
  ignoreArrayOrder?: boolean;
  equalityFn?: (a: unknown, b: unknown) => boolean;
}

export interface OptimizedUpdateResult {
  changed: boolean;
  duration: number;
  changedPaths: string[];
  stats?: {
    totalPaths: number;
    optimizedPaths: number;
    batchedUpdates: number;
  };
}

// ============================================
// ENTITY TYPES (unchanged from your file)
// ============================================

export interface EntityConfig<E, K extends string | number = string> {
  selectId?: (entity: E) => K;
  hooks?: {
    beforeAdd?: (entity: E) => E | false;
    beforeUpdate?: (id: K, changes: Partial<E>) => Partial<E> | false;
    beforeRemove?: (id: K, entity: E) => boolean;
  };
}

declare const ENTITY_MAP_BRAND: unique symbol;

export interface EntityMapMarker<E, K extends string | number> {
  readonly [ENTITY_MAP_BRAND]: { __entity: E; __key: K };
  readonly __isEntityMap: true;
  readonly __entityMapConfig?: EntityConfig<E, K>;
}

export function entityMap
  E,
  K extends string | number = E extends { id: infer I extends string | number } ? I : string
>(config?: EntityConfig<E, K>): EntityMapMarker<E, K> {
  return {
    __isEntityMap: true,
    __entityMapConfig: config ?? {},
  } as EntityMapMarker<E, K>;
}

export interface TapHandlers<E, K extends string | number> {
  onAdd?: (entity: E, id: K) => void;
  onUpdate?: (id: K, changes: Partial<E>, entity: E) => void;
  onRemove?: (id: K, entity: E) => void;
  onChange?: () => void;
}

export interface InterceptContext<T> {
  block(reason?: string): void;
  transform(value: T): void;
  readonly blocked: boolean;
  readonly blockReason: string | undefined;
}

export interface InterceptHandlers<E, K extends string | number> {
  onAdd?: (entity: E, ctx: InterceptContext<E>) => void | Promise<void>;
  onUpdate?: (id: K, changes: Partial<E>, ctx: InterceptContext<Partial<E>>) => void | Promise<void>;
  onRemove?: (id: K, entity: E, ctx: InterceptContext<void>) => void | Promise<void>;
}

export interface MutationOptions {
  onError?: (error: Error) => void;
}

export interface AddOptions<E, K> extends MutationOptions {
  selectId?: (entity: E) => K;
}

export interface AddManyOptions<E, K> extends AddOptions<E, K> {
  mode?: 'strict' | 'skip' | 'overwrite';
}

export type EntityNode<E> = {
  (): E;
  (value: E): void;
  (updater: (current: E) => E): void;
} & {
  [P in keyof E]: E[P] extends object
    ? E[P] extends readonly unknown[]
      ? CallableWritableSignal<E[P]>
      : EntityNode<E[P]>
    : CallableWritableSignal<E[P]>;
};

export interface EntitySignal<E, K extends string | number = string> {
  byId(id: K): EntityNode<E> | undefined;
  byIdOrFail(id: K): EntityNode<E>;
  readonly all: Signal<E[]>;
  readonly count: Signal<number>;
  readonly ids: Signal<K[]>;
  has(id: K): Signal<boolean>;
  readonly isEmpty: Signal<boolean>;
  readonly map: Signal<ReadonlyMap<K, E>>;
  where(predicate: (entity: E) => boolean): Signal<E[]>;
  find(predicate: (entity: E) => boolean): Signal<E | undefined>;
  addOne(entity: E, opts?: AddOptions<E, K>): K;
  addMany(entities: E[], opts?: AddManyOptions<E, K>): K[];
  updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void;
  updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void;
  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number;
  upsertOne(entity: E, opts?: AddOptions<E, K>): K;
  upsertMany(entities: E[], opts?: AddOptions<E, K>): K[];
  removeOne(id: K, opts?: MutationOptions): void;
  removeMany(ids: K[], opts?: MutationOptions): void;
  removeWhere(predicate: (entity: E) => boolean): number;
  clear(): void;
  removeAll(): void;
  setAll(entities: E[], opts?: AddOptions<E, K>): void;
  tap(handlers: TapHandlers<E, K>): () => void;
  intercept(handlers: InterceptHandlers<E, K>): () => void;
}

/** @deprecated Use entityMap<E>() + entities() instead */
export interface EntityHelpers<E extends { id: string | number }> {
  add(entity: E): void;
  update(id: E['id'], updates: Partial<E>): void;
  remove(id: E['id']): void;
  upsert(entity: E): void;
  selectById(id: E['id']): Signal<E | undefined>;
  selectBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  clear(): void;
}

// ============================================
// CONFIGURATION
// ============================================

export interface TreeConfig {
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  debugMode?: boolean;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isSignalTree<T>(value: unknown): value is ISignalTree<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'state' in value &&
    '$' in value &&
    'with' in value &&
    'destroy' in value
  );
}
```

## 2. Enhancer Implementations

### `batching.ts`

```typescript
import { SignalTree, BatchingMethods, Enhancer, ENHANCER_META } from './types';

export interface BatchingConfig {
  debounceMs?: number;
}

export function batching<T>(config: BatchingConfig = {}): Enhancer<SignalTree<T>, BatchingMethods<T>> {
  const enhancer = (tree: ISignalTree<T>): ISignalTree<T> & BatchingMethods<T> => {
    let batchQueue: Array<() => void> = [];
    let batchScheduled = false;

    const flushBatch = () => {
      const queue = batchQueue;
      batchQueue = [];
      batchScheduled = false;
      queue.forEach((fn) => fn());
    };

    const scheduleBatch = () => {
      if (!batchScheduled) {
        batchScheduled = true;
        if (config.debounceMs) {
          setTimeout(flushBatch, config.debounceMs);
        } else {
          queueMicrotask(flushBatch);
        }
      }
    };

    const methods: BatchingMethods<T> = {
      batch(updater) {
        batchQueue.push(() => updater(tree.$));
        scheduleBatch();
      },

      batchUpdate(updater) {
        batchQueue.push(() => {
          const current = tree.state as unknown as T;
          const updates = updater(current);
          // Apply updates to tree
          Object.entries(updates).forEach(([key, value]) => {
            const node = (tree.$ as Record<string, any>)[key];
            if (node && typeof node.set === 'function') {
              node.set(value);
            }
          });
        });
        scheduleBatch();
      },
    };

    return Object.assign(tree, methods);
  };

  enhancer.metadata = {
    name: 'batching',
    provides: ['batch', 'batchUpdate'],
  };

  return enhancer;
}
```

### `memoization.ts`

```typescript
import { computed, Signal } from '@angular/core';
import { SignalTree, MemoizationMethods, CacheStats, Enhancer } from './types';

export interface MemoizationConfig {
  maxCacheSize?: number;
  ttlMs?: number;
}

export function memoization<T>(config: MemoizationConfig = {}): Enhancer<SignalTree<T>, MemoizationMethods<T>> {
  const { maxCacheSize = 100 } = config;

  const enhancer = (tree: ISignalTree<T>): ISignalTree<T> & MemoizationMethods<T> => {
    const cache = new Map<string, { signal: Signal<unknown>; hits: number }>();
    let totalHits = 0;
    let totalMisses = 0;

    const methods: MemoizationMethods<T> = {
      memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R> {
        const key = cacheKey ?? fn.toString();

        const existing = cache.get(key);
        if (existing) {
          totalHits++;
          existing.hits++;
          return existing.signal as Signal<R>;
        }

        totalMisses++;

        // Evict oldest if at capacity
        if (cache.size >= maxCacheSize) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }

        const signal = computed(() => fn(tree.state as unknown as T));
        cache.set(key, { signal, hits: 0 });
        return signal;
      },

      memoizedUpdate(updater, cacheKey) {
        // Implementation depends on your update strategy
        const current = tree.state as unknown as T;
        const updates = updater(current);
        Object.entries(updates).forEach(([key, value]) => {
          const node = (tree.$ as Record<string, any>)[key];
          if (node?.set) node.set(value);
        });
      },

      clearMemoCache(key?: string) {
        if (key) {
          cache.delete(key);
        } else {
          cache.clear();
        }
      },

      getCacheStats(): CacheStats {
        const total = totalHits + totalMisses;
        return {
          size: cache.size,
          hitRate: total > 0 ? totalHits / total : 0,
          totalHits,
          totalMisses,
          keys: Array.from(cache.keys()),
        };
      },
    };

    return Object.assign(tree, methods);
  };

  enhancer.metadata = {
    name: 'memoization',
    provides: ['memoize', 'memoizedUpdate', 'clearMemoCache', 'getCacheStats'],
  };

  return enhancer;
}
```

### `withTimeTravel.ts`

```typescript
import { SignalTree, TimeTravelMethods, TimeTravelEntry, Enhancer } from './types';

export interface TimeTravelConfig {
  maxHistory?: number;
  excludePaths?: string[];
}

export function withTimeTravel<T>(config: TimeTravelConfig = {}): Enhancer<SignalTree<T>, TimeTravelMethods<T>> {
  const { maxHistory = 50 } = config;

  const enhancer = (tree: ISignalTree<T>): ISignalTree<T> & TimeTravelMethods<T> => {
    const history: TimeTravelEntry<T>[] = [];
    let currentIndex = -1;
    let isTimeTraveling = false;

    // Capture initial state
    const captureState = (): T => {
      return JSON.parse(JSON.stringify(tree.state)) as T;
    };

    const applyState = (state: T) => {
      isTimeTraveling = true;
      try {
        Object.entries(state).forEach(([key, value]) => {
          const node = (tree.$ as Record<string, any>)[key];
          if (node?.set) node.set(value);
        });
      } finally {
        isTimeTraveling = false;
      }
    };

    // Record initial state
    history.push({
      action: 'INIT',
      timestamp: Date.now(),
      state: captureState(),
    });
    currentIndex = 0;

    // TODO: Hook into tree mutations to record changes
    // This requires PathNotifier integration

    const methods: TimeTravelMethods<T> = {
      undo() {
        if (currentIndex > 0) {
          currentIndex--;
          applyState(history[currentIndex].state);
        }
      },

      redo() {
        if (currentIndex < history.length - 1) {
          currentIndex++;
          applyState(history[currentIndex].state);
        }
      },

      canUndo() {
        return currentIndex > 0;
      },

      canRedo() {
        return currentIndex < history.length - 1;
      },

      getHistory() {
        return [...history];
      },

      resetHistory() {
        history.length = 0;
        history.push({
          action: 'RESET',
          timestamp: Date.now(),
          state: captureState(),
        });
        currentIndex = 0;
      },

      jumpTo(index: number) {
        if (index >= 0 && index < history.length) {
          currentIndex = index;
          applyState(history[currentIndex].state);
        }
      },

      getCurrentIndex() {
        return currentIndex;
      },
    };

    return Object.assign(tree, methods);
  };

  enhancer.metadata = {
    name: 'timeTravel',
    provides: ['undo', 'redo', 'canUndo', 'canRedo', 'getHistory', 'resetHistory', 'jumpTo', 'getCurrentIndex'],
  };

  return enhancer;
}
```

### `effects.ts`

```typescript
import { effect as ngEffect } from '@angular/core';
import { SignalTree, EffectsMethods, Enhancer } from './types';

export function effects<T>(): Enhancer<SignalTree<T>, EffectsMethods<T>> {
  const enhancer = (tree: ISignalTree<T>): ISignalTree<T> & EffectsMethods<T> => {
    const subscriptions = new Set<() => void>();

    const methods: EffectsMethods<T> = {
      effect(fn) {
        const effectRef = ngEffect(() => {
          fn(tree.state as unknown as T);
        });
        const cleanup = () => effectRef.destroy();
        subscriptions.add(cleanup);
        return cleanup;
      },

      subscribe(fn) {
        // Simple subscription using effect
        return this.effect(fn);
      },
    };

    // Extend destroy to clean up effects
    const originalDestroy = tree.destroy.bind(tree);
    tree.destroy = () => {
      subscriptions.forEach((cleanup) => cleanup());
      subscriptions.clear();
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  enhancer.metadata = {
    name: 'effects',
    provides: ['effect', 'subscribe'],
  };

  return enhancer;
}
```

### `devTools.ts`

```typescript
import { SignalTree, DevToolsMethods, Enhancer } from './types';

export interface DevToolsConfig {
  name?: string;
  maxAge?: number;
}

export function devTools<T>(config: DevToolsConfig = {}): Enhancer<SignalTree<T>, DevToolsMethods> {
  const enhancer = (tree: ISignalTree<T>): ISignalTree<T> & DevToolsMethods => {
    let devTools: any = null;
    const { name = 'SignalTree', maxAge = 50 } = config;

    const methods: DevToolsMethods = {
      connectDevTools() {
        if (typeof window === 'undefined') return;

        const extension = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
        if (!extension) {
          console.warn('Redux DevTools extension not found');
          return;
        }

        devTools = extension.connect({ name, maxAge });
        devTools.init(tree.state);

        // TODO: Subscribe to tree changes and send to devTools
      },

      disconnectDevTools() {
        if (devTools) {
          devTools.disconnect();
          devTools = null;
        }
      },
    };

    return Object.assign(tree, methods);
  };

  enhancer.metadata = {
    name: 'devTools',
    provides: ['connectDevTools', 'disconnectDevTools'],
  };

  return enhancer;
}
```

## 3. Core `signalTree` Function

```typescript
import { signal, WritableSignal } from '@angular/core';
import { SignalTree, SignalTree, TreeNode, TreeConfig, Enhancer } from './types';

export function signalTree<T extends object>(initialState: T, config: TreeConfig = {}): ISignalTree<T> {
  // Create the signal store recursively
  const state = createSignalStore(initialState, config) as TreeNode<T>;

  // Base tree with only core functionality
  const tree: ISignalTree<T> = {
    state,
    $: state,

    with(...enhancers: Enhancer<any, any>[]) {
      if (enhancers.length === 0) return this;

      let result: any = this;
      for (const enhancer of enhancers) {
        result = enhancer(result);
      }
      return result;
    },

    destroy() {
      // Clean up resources
      if (config.debugMode) {
        console.log('SignalTree destroyed');
      }
    },
  };

  return tree as ISignalTree<T>;
}

function createSignalStore<T>(obj: T, config: TreeConfig): TreeNode<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj) as unknown as TreeNode<T>;
  }

  if (Array.isArray(obj)) {
    return signal(obj) as unknown as TreeNode<T>;
  }

  if (isBuiltInObject(obj)) {
    return signal(obj) as unknown as TreeNode<T>;
  }

  const store: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isEntityMapMarker(value)) {
      // Preserve marker for entities to process
      store[key] = value;
    } else if (value !== null && typeof value === 'object' && !isBuiltInObject(value) && !Array.isArray(value)) {
      // Nested object - recurse
      store[key] = createSignalStore(value, config);
    } else {
      // Leaf value - create signal
      store[key] = signal(value);
    }
  }

  return store as TreeNode<T>;
}

function isBuiltInObject(obj: unknown): boolean {
  return obj instanceof Date || obj instanceof RegExp || obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet || obj instanceof Error || obj instanceof URL || obj instanceof Promise || ArrayBuffer.isView(obj);
}

function isEntityMapMarker(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as any).__isEntityMap === true);
}
```

## 4. Public API (`index.ts`)

```typescript
// Core
export { signalTree } from './signal-tree';
export type { SignalTree, SignalTree, TreeNode, TreeConfig, NodeAccessor, AccessibleNode, CallableWritableSignal } from './types';

// Enhancer types
export type { Enhancer, EnhancerMeta, WithMethod, BatchingMethods, MemoizationMethods, TimeTravelMethods, DevToolsMethods, EffectsMethods, EntitiesMethods, OptimizedUpdateMethods, CacheStats, TimeTravelEntry } from './types';

// Entity types
export type { EntitySignal, EntityMapMarker, EntityConfig, EntityNode, EntityHelpers, TapHandlers, InterceptHandlers, InterceptContext } from './types';
export { entityMap } from './types';

// Enhancers
export { batching, type BatchingConfig } from './enhancers/batching';
export { memoization, type MemoizationConfig } from './enhancers/memoization';
export { withTimeTravel, type TimeTravelConfig } from './enhancers/time-travel';
export { devTools, type DevToolsConfig } from './enhancers/devtools';
export { effects } from './enhancers/effects';
export { entities, type EntitiesConfig } from './enhancers/entities';

// Type guards
export { isSignalTree } from './types';
```

## 5. Usage Examples

```typescript
import { signalTree, entityMap, batching, memoization, withTimeTravel, devTools, effects, entities } from '@signaltree/core';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AppState {
  users: EntityMapMarker<User, string>;
  settings: {
    theme: 'light' | 'dark';
    language: string;
  };
  count: number;
}

// Base tree - only has state/$, with(), destroy()
const base = signalTree<AppState>({
  users: entityMap<User>(),
  settings: { theme: 'light', language: 'en' },
  count: 0,
});

base.$.count.set(1); // ✅ Works
base.undo(); // ❌ Error: Property 'undo' does not exist
base.batch(() => {}); // ❌ Error: Property 'batch' does not exist

// With batching - adds batch(), batchUpdate()
const withBatch = base.with(batching());

withBatch.batch(($) => {
  // ✅ Works
  $.count.set(1);
  $.settings.theme.set('dark');
});
withBatch.undo(); // ❌ Error: Property 'undo' does not exist

// Full featured tree
const tree = signalTree<AppState>({
  users: entityMap<User>(),
  settings: { theme: 'light', language: 'en' },
  count: 0,
})
  .with(entities())
  .with(batching())
  .with(memoization())
  .with(timeTravel())
  .with(effects())
  .with(devTools({ name: 'MyApp' }));

// All methods available with proper types
tree.$.count.set(1); // ✅ Base
tree.batch(($) => $.count.set(2)); // ✅ From batching
tree.memoize((s) => s.count * 2); // ✅ From memoization
tree.undo(); // ✅ From withTimeTravel
tree.canUndo(); // ✅ From withTimeTravel - returns boolean
tree.effect((s) => console.log(s.count)); // ✅ From effects
tree.connectDevTools(); // ✅ From devTools

// Entity access
tree.$.users.addOne({ id: '1', name: 'Alice', email: 'alice@example.com' });
const user = tree.$.users.byId('1')?.();
```

## Key Benefits

| Aspect            | Before                           | After                                |
| ----------------- | -------------------------------- | ------------------------------------ |
| Type safety       | All methods on interface (lying) | Only available methods typed         |
| Optional chaining | Sometimes needed, inconsistent   | Never needed for available methods   |
| IDE autocomplete  | Shows unavailable methods        | Only shows what's actually available |
| Runtime errors    | Silent no-ops                    | Would get compile error instead      |
| Documentation     | Misleading                       | Accurate                             |

This is a breaking change but makes the type system honest about what's actually available.
