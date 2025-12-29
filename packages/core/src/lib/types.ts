import { Signal, WritableSignal } from '@angular/core';

import { SecurityValidatorConfig } from './security/security-validator';

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
    : T[K] extends object
    ? NodeAccessor<T[K]> & TreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};

// Base SignalTree minimal interface
export interface SignalTreeBase<T> extends NodeAccessor<T> {
  readonly state: TreeNode<T>;
  readonly $: TreeNode<T>;
  // Single-enhancer chain: apply one enhancer at a time.
  with<A>(enhancer: Enhancer<A>): SignalTreeBase<T> & A;
  bind(thisArg?: unknown): NodeAccessor<T>;
  destroy(): void;
  // Allow enhancers to attach runtime methods — consumers should cast to the
  // specific enhanced shape they expect (e.g. `SignalTreeBase<T> & BatchingMethods<T>`).
}

// Method interfaces
export interface EffectsMethods<T> {
  effect(fn: (state: T) => void): () => void;
  subscribe(fn: (state: T) => void): () => void;
}

export interface BatchingMethods<T> {
  batch(updater: (state: TreeNode<T>) => void): void;
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

export interface MemoizationMethods<T> {
  memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R>;
  memoizedUpdate(updater: (current: T) => Partial<T>, cacheKey?: string): void;
  clearMemoCache(key?: string): void;
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    keys: string[];
  };
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

export interface TimeTravelMethods<T> {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  jumpTo(index: number): void;
  getCurrentIndex(): number;
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
 * }).with(withEntities());
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
 *   .with(withEntities());
 * tree.$.users.add(user);
 * tree.$.users.byId(id)();
 * ```
 *
 * @see entityMap for the new marker function
 * @see withEntities for the new enhancer
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
  name?: string;
  maxAge?: number;
  features?: {
    jump?: boolean;
    skip?: boolean;
    reorder?: boolean;
  };
}

/** Batching enhancer configuration (canonical) */
export interface BatchingConfig {
  debounceMs?: number;
  maxBatchSize?: number;
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
export type TypedSignalTree<T> = SignalTreeBase<T> & {
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
 */
export type Enhancer<TAdded> = <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & TAdded;

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
 * V6 removes the old monolithic `SignalTree<T>` in favor of a minimal
 * `SignalTreeBase<T>` and opt-in intersections with method interfaces.
 */
export type FullSignalTree<T> = SignalTreeBase<T> &
  EffectsMethods<T> &
  BatchingMethods<T> &
  MemoizationMethods<T> &
  TimeTravelMethods<T> &
  DevToolsMethods &
  EntitiesEnabled &
  OptimizedUpdateMethods<T>;

export type ProdSignalTree<T> = SignalTreeBase<T> &
  EffectsMethods<T> &
  BatchingMethods<T> &
  MemoizationMethods<T> &
  EntitiesEnabled &
  OptimizedUpdateMethods<T>;

/** Minimal tree (just effects) */
export type MinimalSignalTree<T> = SignalTreeBase<T> & EffectsMethods<T>;

// Backwards-compatible aliases expected by older consumers
// v6: remove legacy `SignalTree` alias and multi-overload `WithMethod`.
// Consumers should use `SignalTreeBase<T>` for the minimal runtime shape
// and opt into `FullSignalTree<T>` / `ProdSignalTree<T>` when they need
// the enhanced feature set. Helper presets produce those enhanced shapes.

// Note: `SignalTree` alias is provided by the separate `types` package.
// Core now uses `SignalTreeBase<T>` and the dedicated `types` package
// supplies the legacy `SignalTree<T>` declaration to avoid duplicate
// identifier collisions during monorepo type-checking.

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a SignalTree
 */
export function isSignalTree<T>(value: unknown): value is SignalTreeBase<T> {
  return (
    value !== null &&
    typeof value === 'function' && // It's a callable function
    'state' in value &&
    '$' in value &&
    'with' in value &&
    'destroy' in value
  );
}
