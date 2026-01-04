import { Signal, WritableSignal } from '@angular/core';

import { SecurityValidatorConfig } from './security/security-validator';

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
// Memoization enhancer configuration (canonical)
export interface MemoizationConfig {
  /** Enable/disable memoization (default: true) */
  enabled?: boolean;
  /** Maximum number of cached computations (default: 100) */
  maxCacheSize?: number;
  /** Time-to-live for cache entries in milliseconds */
  ttl?: number;
  /** Enable LRU eviction (default: true) */
  enableLRU?: boolean;
  /** Equality strategy for cache comparison (default: 'deep') */
  equality?: 'deep' | 'shallow' | 'reference';
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

declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: NotFn<T>): void;
    (updater: (current: T) => T): void;
  }
}

export interface NodeAccessor<T> {
  (): T;
  (value: T): void;
  (updater: (current: T) => T): void;
}

// TreeNode represents the runtime shape of the tree where properties are
// accessed by string keys at runtime. Previously this was strictly mapped
// to `keyof T` which caused incompatibilities across packages when an
// enhancer or helper used a different generic parameter name. Relax the
// index signature to permit dynamic string indexing while still preserving
// the mapped keys for better editor DX.
// Default TreeNode maps known keys to either EntitySignal or CallableWritableSignal
// and still allows dynamic string indexing at runtime.
export type TreeNode<T> = {
  [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
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
  readonly state: TreeNode<T>;
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
  // Allow enhancers to attach runtime methods — consumers should cast to the
  // specific enhanced shape they expect (e.g. `SignalTree<T> & BatchingMethods<T>`).
}

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

export interface MemoizationMethods<T> {
  /** Memoize a computation based on state and optional cache key */
  memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R>;
  /** Memoized update for partial state, with optional cache key */
  memoizedUpdate?: (
    updater: (current: T) => Partial<T>,
    cacheKey?: string
  ) => void;
  /** Clear the memoization cache (optionally by key) */
  clearMemoCache(key?: string): void;
  /** Alias for clearMemoCache for compatibility */
  clearCache?: (key?: string) => void;
  /** Get cache statistics */
  getCacheStats(): CacheStats;
}

/**
 * Statistics returned by memoization caches
 */
export type CacheStats = {
  size: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  keys: string[];
};

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
  connectDevTools(): void;
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

export type TreePreset = 'basic' | 'performance' | 'development' | 'production';

export interface TreeConfig {
  batchUpdates?: boolean;
  useMemoization?: boolean;
  enableTimeTravel?: boolean;
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  trackPerformance?: boolean;
  treeName?: string;
  enableDevTools?: boolean;
  debugMode?: boolean;
  useStructuralSharing?: boolean;

  /**
   * Security validation configuration
   * When enabled, validates keys and values during tree construction and updates
   * to prevent prototype pollution, XSS, and function values.
   *
   * @default undefined (no security validation)
   * @see SecurityValidator for configuration options
   *
   * @example
   * ```ts
   * // Enable all security features
   * const tree = signalTree(state, {
   *   security: {
   *     preventPrototypePollution: true,
   *     preventXSS: true,
   *     preventFunctions: true,
   *     onSecurityEvent: (event) => console.warn('Security event:', event)
   *   }
   * });
   *
   * // Or use a preset
   * const tree = signalTree(state, {
   *   security: SecurityPresets.strict().getConfig()
   * });
   * ```
   */
  security?: SecurityValidatorConfig;
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
 * }).with(entities());
 * ```
 */
export function entityMap<
  E,
  K extends string | number = E extends { id: infer I extends string | number }
    ? I
    : string
>(config?: EntityConfig<E, K>): EntityMapMarker<E, K> {
  // Runtime: only needs __isEntityMap for detection
  // Type-level: the brand symbol makes this nominally typed
  return {
    __isEntityMap: true,
    __entityMapConfig: config ?? {},
  } as EntityMapMarker<E, K>;
}

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
  readonly isEmpty: Signal<boolean>;
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
 * const tree = signalTree<State>({ users: entityMap<User>() })
 *   .with(entities());
 * tree.$.users.add(user);
 * tree.$.users.byId(id)();
 * ```
 *
 * @see entityMap for the new marker function
 * @see entities for the new enhancer
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
  [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
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
  [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
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

export type CallableWritableSignal<T> = WritableSignal<T> & {
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
};

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
/**
 * Convenience signal tree aliases representing common preset combinations.
 */

export type FullSignalTree<T> = ISignalTree<T> &
  EffectsMethods<T> &
  BatchingMethods<T> &
  MemoizationMethods<T> &
  TimeTravelMethods<T> &
  DevToolsMethods &
  EntitiesEnabled &
  OptimizedUpdateMethods<T>;

export type ProdSignalTree<T> = ISignalTree<T> &
  EffectsMethods<T> &
  BatchingMethods<T> &
  MemoizationMethods<T> &
  EntitiesEnabled &
  OptimizedUpdateMethods<T>;

/** Minimal tree (just effects) */
export type MinimalSignalTree<T> = ISignalTree<T> & EffectsMethods<T>;

// Backwards-compatible aliases expected by older consumers
// v6: remove legacy `SignalTree` alias and multi-overload `WithMethod`.
// Consumers should use `SignalTree<T>` for the minimal runtime shape
// and opt into `FullSignalTree<T>` / `ProdSignalTree<T>` when they need
// the enhanced feature set. Helper presets produce those enhanced shapes.

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
