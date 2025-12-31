import { SecurityValidatorConfig } from './security/security-validator';

import type {
  NotFn,
  NodeAccessor,
  TreeNode,
  EntitySignal,
  EntityMapMarker,
  CallableWritableSignal,
  Signal,
  WritableSignal,
  ISignalTree,
  EffectsMethods,
  BatchingConfig,
  BatchingMethods,
  MemoizationMethods,
  CacheStats,
  TimeTravelMethods,
  DevToolsMethods,
  EntitiesEnabled,
  OptimizedUpdateMethods,
  TimeTravelEntry,
  TreePreset,
  TreeConfig,
} from '@signaltree/types';

// All foundational and shared types are imported from @signaltree/types. Do not redeclare them here.

// ...existing code...

// Method interfaces
export interface EffectsMethods<T> {
  /** Register an effect that can optionally return a cleanup function */
  effect(fn: (state: T) => void | (() => void)): () => void;

  /** Subscribe to state changes (simpler alternative to effect) */
  subscribe(fn: (state: T) => void): () => void;
}

/** Batching enhancer configuration (canonical) */
export interface BatchingConfig {
  /** Enable/disable batching (default: true) */
  enabled?: boolean;
  /** Milliseconds to debounce flushes when batching is enabled */
  debounceMs?: number;
  /** Legacy alias for debounceMs used in some demo code */
  batchTimeoutMs?: number;
  /** Milliseconds to auto-flush pending batches (compatibility name) */
  autoFlushDelay?: number;
  maxBatchSize?: number;
}

export interface BatchingMethods<T = unknown> {
  batch(fn: () => void): void;
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

// ...existing code...

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
 */
export type Enhancer<TAdded> = <Tree extends ISignalTree<unknown>>(
  tree: Tree
) => Tree & TAdded;

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
export type SignalTree<T> = ISignalTree<T>;
export type SignalTreeBase<T> = ISignalTree<T>;

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
