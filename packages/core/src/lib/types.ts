import { Signal, WritableSignal } from '@angular/core';

import { AsyncQueryMarker, AsyncQuerySignal } from './markers/async-query';
import { AsyncSourceMarker, AsyncSourceSignal } from './markers/async-source';
import { AsyncStreamMarker, AsyncStreamSignal } from './markers/async-stream';
import {
  EntityCollectionMarker,
  EntityCollectionSignal,
} from './markers/entity-collection';
import { FormMarker, FormSignal } from './markers/form';
import { StatusMarker, StatusSignal } from './markers/status';
import { StoredMarker, StoredSignal } from './markers/stored';

/**
 * Metadata describing the intent and source of a tree update.
 *
 * Set ambient context for enhancers using `withWriteContext({...}, () => tree.$.x.set(y))`
 * from `@signaltree/core`. Enhancers read the active context via `getActiveWriteContext()`.
 *
 * Consumed by `@signaltree/guardrails` (intent-aware suppression, audit trail) and
 * `@signaltree/validation` (suppress validation on time-travel/hydration replays).
 *
 * NOTE: `@signaltree/validation` reads ONLY `intent` and `source`. Custom keys via
 * the open index signature are guardrails-private — do not expect other enhancers
 * to honor them.
 */
export interface UpdateMetadata {
  /** Intent of the update (closed union — adding new intents is a core change). */
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  /** Source of the update (closed union). */
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  /** Suppress guardrails for this update. */
  suppressGuardrails?: boolean;
  /** Optional correlation ID for related updates. */
  correlationId?: string;
  /** Optional timestamp. */
  timestamp?: number;
  /** Open extension for guardrails' historical custom-key shape. */
  [key: string]: unknown;
}

// Time travel enhancer configuration (canonical)
export interface TimeTravelConfig {
  /** Enable/disable time travel (default: true) */
  enabled?: boolean;
  /**
   * Maximum number of history entries to keep
   * @default 50
   */
  maxHistorySize?: number;

  /**
   * Whether to include payload information in history entries
   * @default true
   */
  includePayload?: boolean;

  /**
   * Custom action names for different operations
   */
  actionNames?: {
    update?: string;
    set?: string;
    batch?: string;
    [key: string]: string | undefined;
  };
}
// Core v6 types — type-safe enhancer architecture

// Primitives
export type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol;

export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;

// NOTE: A `declare module '@angular/core'` augmentation that added callable
// overloads to Angular's `WritableSignal<T>` previously lived here. It was
// removed because it is a *global* augmentation: importing anything from
// `@signaltree/core` would activate it project-wide and conflict with
// libraries that depend on the original invariant `WritableSignal<T>`
// signature (notably `@ngrx/signals`' `WritableStateSource<T>`, which became
// invariance-incompatible — surfacing as ~30 TS2345 errors in mixed
// `@ngrx/signals` + SignalTree codebases). The callable-syntax augmentation
// is intentionally opt-in via `@signaltree/callable-syntax`. Apps that want
// `signal(value)` ergonomics on raw Angular signals should `import
// '@signaltree/callable-syntax'` (side-effect import) or include the
// package in their tsconfig `types`.

export interface NodeAccessor<T> {
  (): T;
  (value: Partial<T>): void;
  (updater: (current: T) => T): void;
}

// TreeNode represents the runtime shape of the tree where properties are
// accessed by string keys at runtime. Previously this was strictly mapped
// to `keyof T` which caused incompatibilities across packages when an
// enhancer or helper used a different generic parameter name. Relax the
// index signature to permit dynamic string indexing while still preserving
// the mapped keys for better editor DX.
// Default TreeNode maps known keys to either EntitySignal, StatusSignal, StoredSignal, FormSignal,
// or CallableWritableSignal and still allows dynamic string indexing at runtime.
export type TreeNode<T> = {
  [K in keyof T]: T[K] extends EntityCollectionMarker<infer CE, infer CK>
    ? EntityCollectionSignal<CE, CK>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : T[K] extends AsyncStreamMarker<infer Chunk, infer State>
    ? AsyncStreamSignal<Chunk, State>
    : T[K] extends Primitive
    ? CallableWritableSignal<T[K]>
    : T[K] extends readonly unknown[]
    ? CallableWritableSignal<T[K]>
    : T[K] extends
        | Date
        | RegExp
        | Map<any, any>
        | Set<any>
        | Error
        | ((...args: unknown[]) => unknown)
    ? CallableWritableSignal<T[K]> // Built-in objects → treat as atomic values
    : T[K] extends object
    ? NodeAccessor<T[K]> & TreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};

// Base SignalTree minimal interface
// v6: primary runtime tree type is `SignalTree<T>`; a deprecated alias
// `SignalTree<T>` is provided at the end of this file for compatibility.
export interface ISignalTree<T> extends NodeAccessor<T> {
  /** Reactive tree-node accessor — the canonical entry point. */
  readonly $: TreeNode<T>;
  /**
   * Apply an enhancer to the tree.
   * Preserves the caller's tree type (`this`) and intersects with added features.
   *
   * @typeParam TAdded - The additional methods/properties added by the enhancer
   * @param enhancer - Function that receives the tree and returns it with additions
   * @returns The tree with both its original type and the added features
   *
   * @example
   * ```typescript
   * const tree = signalTree<DashboardState>({...})
   *   .with(enterprise())  // Returns tree with DashboardState + enterprise methods
   *   .with(batching());   // Returns tree with DashboardState + enterprise + batching
   *
   * tree.$.metrics  // ✅ DashboardState preserved
   * tree.updateOptimized({...})  // ✅ Enterprise method available
   * tree.batch(() => {...})  // ✅ Batching method available
   * ```
   */
  with<TAdded>(
    enhancer: (tree: ISignalTree<T>) => ISignalTree<T> & TAdded
  ): this & TAdded;
  bind(thisArg?: unknown): NodeAccessor<T>;
  destroy(): void;
  /** Whether this tree has been destroyed. */
  readonly destroyed: Signal<boolean>;
  /**
   * Register a cleanup function to be called when the tree is destroyed.
   * Enhancers should use this to release resources (intervals, subscriptions, etc.).
   */
  registerCleanup(fn: EnhancerCleanup): void;
  /**
   * Apply a partial update and return the dot-paths of leaf signals that
   * actually changed. Paths whose new value is ref-equal to the existing
   * value are skipped both in the underlying `set()` and in the result.
   *
   * Useful for partial server-payload sync, change-log/audit trails, and
   * targeted persistence without pulling in the heavier
   * `@signaltree/enterprise` diff engine.
   *
   * @example
   * ```ts
   * const changed = tree.updateAndReport(serverPayload);
   * if (changed.length) persistKeys(changed);
   * ```
   */
  updateAndReport(updates: Partial<T> | ((current: T) => Partial<T>)): string[];
  // Allow enhancers to attach runtime methods — consumers should cast to the
  // specific enhanced shape they expect (e.g. `SignalTree<T> & BatchingMethods<T>`).
}

/** Cleanup function returned or registered by enhancers. */
export type EnhancerCleanup = () => void;

// Method interfaces
export interface EffectsMethods<T> {
  /** Register an effect that can optionally return a cleanup function */
  effect(fn: (state: T) => void | (() => void)): () => void;

  /** Subscribe to state changes (simpler alternative to effect) */
  subscribe(fn: (state: T) => void): () => void;
}

/**
 * Configuration for the batching enhancer.
 *
 * IMPORTANT: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 */
export interface BatchingConfig {
  /**
   * Whether batching is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Delay before flushing CD notifications (ms).
   * 0 = microtask (default), >0 = setTimeout with delay.
   * @default 0
   */
  notificationDelayMs?: number;
}

/**
 * Methods added by the batching() enhancer.
 *
 * IMPORTANT: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 */
export interface BatchingMethods<T = unknown> {
  /**
   * Group multiple updates into a single change detection cycle.
   * Signal values update immediately; CD notification is batched.
   *
   * @example
   * tree.batch(() => {
   *   tree.$.a.set(1);  // Value updates immediately
   *   tree.$.b.set(2);  // Value updates immediately
   *   console.log(tree.$.a()); // Returns 1 ✅
   * });
   * // Single CD notification after batch completes
   */
  batch(fn: () => void): void;

  /**
   * Coalesce rapid updates to the same path.
   * Only the final value for each path is written.
   * Use for high-frequency updates (typing, dragging, etc.)
   *
   * @example
   * tree.coalesce(() => {
   *   tree.$.query.set('h');
   *   tree.$.query.set('he');
   *   tree.$.query.set('hel');
   * });
   * // Only 'hel' is written to the signal
   */
  coalesce(fn: () => void): void;

  /**
   * Check if there are pending CD notifications.
   */
  hasPendingNotifications(): boolean;

  /**
   * Manually flush pending CD notifications.
   * Rarely needed - notifications flush automatically on microtask.
   */
  flushNotifications(): void;
}

export interface TimeTravelMethods<T = unknown> {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  jumpTo(index: number): void;
  getCurrentIndex(): number;
  /** Internal time-travel manager exposed for advanced tooling/debugging */
  readonly __timeTravel?: {
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    getHistory(): TimeTravelEntry<T>[];
    resetHistory(): void;
    jumpTo(index: number): void;
    getCurrentIndex(): number;
  };
}

export interface DevToolsMethods {
  connectDevTools(treeName?: string): void;
  disconnectDevTools(): void;
}

/**
 * Marker interface indicating entities have been materialized at runtime.
 * Prefer accessing entity collections via `tree.$.prop` (typed as `EntitySignal`).
 */
export interface EntitiesEnabled {
  /** @internal */
  readonly __entitiesEnabled?: true;
}

export interface OptimizedUpdateMethods<T> {
  updateOptimized(
    updates: Partial<T>,
    options?: {
      batch?: boolean;
      batchSize?: number;
      maxDepth?: number;
      ignoreArrayOrder?: boolean;
      equalityFn?: (a: unknown, b: unknown) => boolean;
    }
  ): {
    changed: boolean;
    duration: number;
    changedPaths: string[];
    stats?: {
      totalPaths: number;
      optimizedPaths: number;
      batchedUpdates: number;
    };
  };
}

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload?: unknown;
}

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface TreeConfig {
  batchUpdates?: boolean;
  enableTimeTravel?: boolean;

  /**
   * Force lazy (`true`) or eager (`false`) signal creation, overriding the
   * automatic size threshold.
   *
   * v11 change: lazy mode only runs when the `lazy` feature is also injected
   * (`lazy: lazy()` from `@signaltree/core/lazy`). Without it, this flag is a
   * no-op and trees are always eager — the lazy proxy + memory manager
   * (~2.6KB) tree-shake out of bundles that don't opt in.
   */
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  trackPerformance?: boolean;
  treeName?: string;
  enableDevTools?: boolean;
  debugMode?: boolean;
  useStructuralSharing?: boolean;

  /**
   * Construction-time security validation, built with the `security()` helper
   * from `@signaltree/core/security`. When present, its `validate()` runs
   * synchronously during construction to reject prototype pollution, XSS, and
   * function values.
   *
   * v11 change: pass `security: security(config)` (from the `/security`
   * subpath), not a raw `SecurityValidatorConfig`. This keeps `SecurityValidator`
   * (~2.4KB) out of every bundle that doesn't opt in.
   *
   * @default undefined (no security validation)
   *
   * @example
   * ```ts
   * import { signalTree } from '@signaltree/core';
   * import { security, SecurityPresets } from '@signaltree/core/security';
   *
   * const tree = signalTree(state, { security: security({ preventXSS: true }) });
   * const strict = signalTree(state, { security: security(SecurityPresets.strict().getConfig()) });
   * ```
   */
  security?: SecurityFeature;

  /**
   * Opt-in lazy signal creation, built with the `lazy()` helper from
   * `@signaltree/core/lazy`. When present, large trees (or `useLazySignals:
   * true`) materialize signals on-demand through a Proxy backed by a memory
   * manager; when absent, trees are always eager.
   *
   * v11 change: lazy mode is no longer automatic — inject `lazy: lazy()` to
   * enable it. This keeps the lazy proxy + `SignalMemoryManager` (~2.6KB) out
   * of every bundle that doesn't use it.
   *
   * @default undefined (eager signal creation)
   *
   * @example
   * ```ts
   * import { signalTree } from '@signaltree/core';
   * import { lazy } from '@signaltree/core/lazy';
   *
   * // Auto-threshold applies once lazy is injected (large state → lazy):
   * const tree = signalTree(largeState, { lazy: lazy() });
   * // Force lazy even for small state:
   * const forced = signalTree(state, { lazy: lazy(), useLazySignals: true });
   * ```
   */
  lazy?: LazyFeature;
}

/**
 * Opt-in lazy feature carried on {@link TreeConfig.lazy}. Built by `lazy()`
 * from `@signaltree/core/lazy`. Defined here (not in the lazy subpath) so core
 * can type the config and build the tree without statically importing the lazy
 * proxy or memory manager, keeping them tree-shakeable.
 */
export interface LazyFeature {
  readonly __signalTreeLazy: true;
  /**
   * Build the lazy proxy tree. Returns the tree plus a `dispose` hook the core
   * calls on `tree.destroy()`. Invoked only when lazy mode is selected.
   */
  build<T extends object>(
    obj: T,
    equalityFn: (a: unknown, b: unknown) => boolean
  ): { tree: TreeNode<T>; dispose: () => void };
}

/**
 * Construction-time security feature carried on {@link TreeConfig.security}.
 * Built by `security()` from `@signaltree/core/security`. Defined here (not in
 * the security subpath) so core can type the config without importing the
 * validator, keeping it tree-shakeable.
 */
export interface SecurityFeature {
  readonly __signalTreeSecurity: true;
  validate(state: unknown): void;
}

// ============================================
// FEATURE TYPES
// ============================================

// ============================================
// ENTITY MAP & SIGNAL TYPES
// ============================================

/**
 * Entity configuration options
 */
export interface EntityConfig<E, K extends string | number = string> {
  /**
   * Extract ID from entity. Default: (e) => e.id
   * Required if entity doesn't have 'id' property.
   */
  selectId?: (entity: E) => K;

  /**
   * Optional comparator that keeps `all` and `ids` in a stable sorted order
   * (parity with @ngrx/entity's `sortComparer`). When provided, the `all()`
   * and `ids()` signals reflect this order regardless of insertion order;
   * `map()` retains insertion order. Omit for insertion-order collections.
   *
   * @example
   * entityMap<User>({ sortComparer: (a, b) => a.name.localeCompare(b.name) })
   */
  sortComparer?: (a: E, b: E) => number;

  /**
   * Entity-level hooks (run before collection hooks)
   */
  hooks?: {
    /** Transform or block before add. Return false to block, entity to transform. */
    beforeAdd?: (entity: E) => E | false;
    /** Transform or block before update. Return false to block, changes to transform. */
    beforeUpdate?: (id: K, changes: Partial<E>) => Partial<E> | false;
    /** Block before remove. Return false to block. */
    beforeRemove?: (id: K, entity: E) => boolean;
  };
}

/**
 * Unique symbol for EntityMapMarker branding.
 * NOT EXPORTED - this prevents external code from creating types that satisfy EntityMapMarker.
 * This is critical for correct type inference in generic contexts.
 */
declare const ENTITY_MAP_BRAND: unique symbol;

/**
 * Runtime marker for entity collections.
 * Uses a unique symbol brand to ensure only types created via entityMap() can satisfy this interface.
 * This prevents generic mapped type conditionals from producing unions.
 */
export interface EntityMapMarker<E, K extends string | number> {
  /** Unique brand - only satisfiable by entityMap() since symbol is not exported */
  readonly [ENTITY_MAP_BRAND]: { __entity: E; __key: K };
  /** Runtime marker so enhancers can detect entity collections */
  readonly __isEntityMap: true;
  /** Persisted config used when materializing the EntitySignal */
  readonly __entityMapConfig?: EntityConfig<E, K>;
}

/**
 * Create an entity map marker for use in signalTree state definition.
 * This is the ONLY way to create a type that satisfies EntityMapMarker,
 * since the brand symbol is not exported.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 * });
 * ```
 *
 * @see {@link ./markers/entity-map.ts} for the self-registering implementation
 */
// Re-export from self-registering marker module
export { entityMap } from './markers/entity-map';

/**
 * Mutation options
 */
export interface MutationOptions {
  onError?: (error: Error) => void;
}

export interface AddOptions<E, K> extends MutationOptions {
  selectId?: (entity: E) => K;
}

export interface AddManyOptions<E, K> extends AddOptions<E, K> {
  mode?: 'strict' | 'skip' | 'overwrite';
}

/**
 * Tap handlers - observe entity lifecycle events
 */
export interface TapHandlers<E, K extends string | number> {
  onAdd?: (entity: E, id: K) => void;
  onUpdate?: (id: K, changes: Partial<E>, entity: E) => void;
  onRemove?: (id: K, entity: E) => void;
  onChange?: () => void;
}

/**
 * Intercept context for blocking/transforming mutations
 */
export interface InterceptContext<T> {
  block(reason?: string): void;
  transform(value: T): void;
  readonly blocked: boolean;
  readonly blockReason: string | undefined;
}

/**
 * Intercept handlers - block or transform mutations before they happen
 */
export interface InterceptHandlers<E, K extends string | number> {
  onAdd?: (entity: E, ctx: InterceptContext<E>) => void | Promise<void>;
  onUpdate?: (
    id: K,
    changes: Partial<E>,
    ctx: InterceptContext<Partial<E>>
  ) => void | Promise<void>;
  onRemove?: (
    id: K,
    entity: E,
    ctx: InterceptContext<void>
  ) => void | Promise<void>;
}

/**
 * Entity node with deep signal access
 */
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

/**
 * EntitySignal provides reactive entity collection management.
 */
export interface EntitySignal<E, K extends string | number = string> {
  // Explicit access
  byId(id: K): EntityNode<E> | undefined;
  byIdOrFail(id: K): EntityNode<E>;

  // Queries (readonly properties returning signals)
  readonly all: Signal<E[]>;
  readonly count: Signal<number>;
  readonly ids: Signal<K[]>;
  has(id: K): Signal<boolean>;
  /**
   * True when the collection has no entities. v10.3 canonical name —
   * aligns with FormControl-style bare-boolean accessors used across
   * `status` / `form` / `asyncSource` markers.
   */
  readonly empty: Signal<boolean>;
  readonly map: Signal<ReadonlyMap<K, E>>;
  where(predicate: (entity: E) => boolean): Signal<E[]>;
  find(predicate: (entity: E) => boolean): Signal<E | undefined>;

  // Mutations
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

  // Hooks
  tap(handlers: TapHandlers<E, K>): () => void;
  intercept(handlers: InterceptHandlers<E, K>): () => void;
}

/**
 * @deprecated The old EntityHelpers interface is deprecated and will be removed in v6.0.
 * Use the new Map-based entity API instead:
 *
 * **Migration:**
 * ```typescript
 * // Old (deprecated):
 * interface State { users: User[] }
 * const tree = signalTree<State>({ users: [] });
 * const helpers = tree.entities<User>('users');
 * helpers.add(user);
 * helpers.selectById(id)();
 *
 * // New (recommended):
 *
 * interface State { users: entityMap<User> }
 * const tree = signalTree<State>({ users: entityMap<User>() });
 * tree.$.users.addOne(user);
 * tree.$.users.byId(id)?.();
 * ```
 *
 * @see entityMap for the new marker function
 */
// Legacy `EntityHelpers` removed — v6 uses `EntitySignal` via `tree.$.prop`.

/**
 * Global enhancer configurations
 */
export interface LoggingConfig {
  name?: string;
  filter?: (path: string) => boolean;
  collapsed?: boolean;
  onLog?: (entry: LogEntry) => void;
}

export interface LogEntry {
  path: string;
  prev: unknown;
  value: unknown;
  timestamp: number;
}

export interface ValidationConfig<T> {
  validators: Array<{
    match: (path: string) => boolean;
    validate: (value: T, path: string) => void | never;
  }>;
  onError?: (error: Error, path: string) => void;
}

export interface PersistenceConfig {
  key: string;
  storage?: Storage;
  debounceMs?: number;
  filter?: (path: string) => boolean;
  serialize?: (state: unknown) => string;
  deserialize?: (json: string) => unknown;
}

export interface DevToolsConfig {
  /** Enable Redux DevTools browser extension */
  enableBrowserDevTools?: boolean;
  /** Enable internal logging */
  enableLogging?: boolean;
  /** Performance warning threshold (ms) */
  performanceThreshold?: number;
  /** Enable Redux DevTools time-travel integration */
  enableTimeTravel?: boolean;
  /** Name shown in Redux DevTools */
  name?: string;
  /** Alias for name (legacy support) */
  treeName?: string;
  /** Enable/disable devtools connection */
  enabled?: boolean;
  /** Log actions to console */
  logActions?: boolean;
  /** Max history entries to keep */
  maxAge?: number;
  /** Limit sends to at most once every N milliseconds (0 = no limit) */
  rateLimitMs?: number;
  /** Limit sends by rate (overrides rateLimitMs if provided) */
  maxSendsPerSecond?: number;
  /** Only include actions matching these path patterns */
  includePaths?: string[];
  /** Exclude actions matching these path patterns */
  excludePaths?: string[];
  /** Customize how paths are formatted for display */
  formatPath?: (path: string) => string;
  /** Maximum serialization depth for devtools state snapshots */
  maxDepth?: number;
  /** Maximum array length to serialize per path */
  maxArrayLength?: number;
  /** Maximum string length to serialize per field */
  maxStringLength?: number;
  /** Optional custom serializer for devtools state snapshots */
  serialize?: (state: unknown) => unknown;
  /**
   * Configuration for sharing a single Redux DevTools instance across multiple stores.
   * When provided, stores with the same id will share a single DevTools connection.
   */
  aggregatedReduxInstance?: {
    id: string;
    name?: string;
  };
  features?: {
    jump?: boolean;
    skip?: boolean;
    reorder?: boolean;
  };
}

/**
 * Type utilities for entities
 */
export type EntityType<T> = T extends EntitySignal<
  infer E,
  infer K extends string | number
>
  ? E
  : never;
export type EntityKeyType<T> = T extends EntitySignal<
  unknown,
  infer K extends string | number
>
  ? K
  : never;
export type IsEntityMap<T> = T extends EntityMapMarker<
  unknown,
  infer K extends string | number
>
  ? true
  : false;

/**
 * TreeNode augmented with entity signals
 */
/**
 * Deep recursive tree node shape used for advanced, opt-in typing.
 * This expands nested objects into `EntitySignal` / `EntityNode` shapes
 * and is intentionally expensive for TypeScript to compute. Exported
 * as `DeepEntityAwareTreeNode` so callers can opt-in when they need
 * the full deep inference.
 */
export type DeepEntityAwareTreeNode<T> = {
  [K in keyof T]: T[K] extends EntityCollectionMarker<infer CE, infer CK>
    ? EntityCollectionSignal<CE, CK>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : T[K] extends AsyncStreamMarker<infer Chunk, infer State>
    ? AsyncStreamSignal<Chunk, State>
    : T[K] extends object
    ? DeepEntityAwareTreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};

/**
 * Shallow public tree node used by default in most public APIs.
 * This avoids eagerly expanding deeply nested types and keeps
 * editor/CI responsiveness high while preserving common DX.
 * Consumers who want the fully expanded shape can opt-in via
 * `TypedSignalTree<T>` (see below) or use `DeepEntityAwareTreeNode`.
 */
export type EntityAwareTreeNode<T> = {
  [K in keyof T]: T[K] extends EntityCollectionMarker<infer CE, infer CK>
    ? EntityCollectionSignal<CE, CK>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : T[K] extends AsyncStreamMarker<infer Chunk, infer State>
    ? AsyncStreamSignal<Chunk, State>
    : CallableWritableSignal<T[K]>;
};

/**
 * Opt-in alias providing the full depth-expanded SignalTree typing.
 * Use when you explicitly want deep compile-time inference for nested
 * structures. Example:
 *
 *   type MyTyped = TypedSignalTree<MyState>;
 *   const typed = tree as MyTyped;
 *
 * This keeps the default common path fast while preserving power for
 * advanced users.
 */
export type TypedSignalTree<T> = ISignalTree<T> & {
  $: DeepEntityAwareTreeNode<T>;
};

/**
 * Internal path notifier interface
 * @internal
 */
export interface PathNotifier {
  subscribe(pattern: string, handler: PathHandler): () => void;
  intercept(pattern: string, fn: PathInterceptor): () => void;
  notify(path: string, value: unknown, prev: unknown): void;
}

export type PathHandler = (value: unknown, prev: unknown, path: string) => void;

export type PathInterceptor = (
  ctx: {
    path: string;
    value: unknown;
    prev: unknown;
    blocked: boolean;
    blockReason?: string;
  },
  next: () => void
) => void | Promise<void>;

// ============================================
// BACKWARDS-COMPAT & CONVENIENCE TYPES (stable exports expected by consumers)
// These are intentionally simple aliases or fallbacks to keep the public API stable
// while allowing internal refactors of the type system.

// `CallableWritableSignal<T>` is declared as an interface (not an
// intersection) so TypeScript's overload-resolution picks the getter
// `(): T` first when `Signal<T>` inference walks the call signatures —
// e.g. for `toObservable(tree.$.x)`. Prior to 9.2.0 the global
// `declare module '@angular/core'` augmentation in core also added
// these overloads to the base `WritableSignal<T>` and incidentally
// masked the ordering issue; the interface form makes the contract
// self-contained.
export interface CallableWritableSignal<T> extends WritableSignal<T> {
  (): T;
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
}

export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;

// Removed v5 legacy helper types to reduce public surface area in v6

/** Symbol key for enhancer metadata (stable public export) */
export const ENHANCER_META = Symbol('signaltree:enhancer:meta');

// =============================================================================
// ENHANCER SYSTEM (v6)
// =============================================================================

/**
 * Enhancer function that adds methods to a tree.
 * Generic parameter `TAdded` represents the methods being added.
 *
 * Uses ISignalTree<any> to allow enhancers to be applied to trees
 * that have already accumulated methods from previous enhancers.
 */
export type Enhancer<TAdded> = (
  tree: ISignalTree<any>
) => ISignalTree<any> & TAdded;

/** Enhancer with optional metadata for ordering/debugging */
export type EnhancerWithMeta<TAdded> = Enhancer<TAdded> & {
  metadata?: EnhancerMeta;
};

/** Metadata for enhancer ordering and debugging */
export interface EnhancerMeta {
  name?: string;
  requires?: string[];
  provides?: string[];
  description?: string;
}

// Main public SignalTree interface expected by downstream packages

// Backwards-compatible aliases expected by older consumers
// v6: remove legacy `SignalTree` alias and multi-overload `WithMethod`.
// Consumers should use `SignalTree<T>` for the minimal runtime shape.

// Note: `SignalTree` alias is provided by the separate `types` package.
// Core now uses `SignalTree<T>` and the dedicated `types` package
// supplies the legacy `SignalTree<T>` declaration to avoid duplicate
// identifier collisions during monorepo type-checking.

// Provide lightweight aliases for legacy consumers importing from core.
// These are simple re-exports of the internal `ISignalTree` shape.
// Backwards-compatible alias: include TreeNode<T> so properties copied to
// the root callable are visible in TypeScript (legacy consumers rely on this)
export type SignalTree<T> = ISignalTree<T> & TreeNode<T>;
export type SignalTreeBase<T> = ISignalTree<T> & TreeNode<T>;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a SignalTree
 */
export function isSignalTree<T>(value: unknown): value is ISignalTree<T> {
  return (
    value !== null &&
    typeof value === 'function' && // It's a callable function
    'state' in value &&
    '$' in value &&
    'with' in value &&
    'destroy' in value
  );
}
