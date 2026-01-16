/**
 * SignalTree: Reactive JSON for Angular
 *
 * JSON branches, reactive leaves.
 * No actions. No reducers. No selectors.
 * Type-safe, dot-addressable state where data stays plain
 * and reactivity stays invisible.
 *
 * @packageDocumentation
 */

// ============================================
// CORE EXPORTS
// ============================================

/**
 * Main factory function to create a SignalTree
 * @see {@link signalTree}
 */
export { signalTree } from './lib/signal-tree';

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Core types - Main SignalTree interfaces
  ISignalTree,
  SignalTree,
  SignalTreeBase,
  FullSignalTree,
  ProdSignalTree,
  TreeNode,
  CallableWritableSignal,
  AccessibleNode,
  NodeAccessor,
  Primitive,
  NotFn,

  // Deep path types - For nested entity access (removed in v6)

  // Configuration types
  TreeConfig,
  TreePreset,

  // Enhancer system types
  Enhancer,
  EnhancerMeta,
  EnhancerWithMeta,
  // ChainResult removed in v6
  // WithMethod removed in v6 (single-enhancer runtime)

  // Entity types
  EntitySignal,
  EntityMapMarker,
  EntityConfig,
  MutationOptions,
  AddOptions,
  AddManyOptions,
  TimeTravelEntry,
  TimeTravelMethods,
} from './lib/types';

// Entity helpers (runtime)
export { entityMap } from './lib/types';

// Derived state types (v7)
export type {
  ProcessDerived,
  DeepMergeTree,
  DerivedFactory,
  WithDerived,
} from './lib/internals/derived-types';

// Derived helper (v7.2) - for defining derived functions in separate files with proper typing
export { derivedFrom, externalDerived } from './lib/internals/derived-types';

// Builder types (v7)
export type { SignalTreeBuilder } from './lib/internals/builder-types';

// ============================================
// MARKER EXPORTS
// ============================================

export {
  // derived() function removed in v6.3.1 - use computed() directly
  isDerivedMarker,
  type DerivedMarker,
  type DerivedType,
} from './lib/markers/derived';

// Status marker (v7) - async operation state
export {
  status,
  isStatusMarker,
  LoadingState,
  type StatusMarker,
  type StatusSignal,
  type StatusConfig,
} from './lib/markers/status';

// Stored marker (v7) - localStorage persistence
export {
  stored,
  isStoredMarker,
  type StoredMarker,
  type StoredSignal,
  type StoredOptions,
} from './lib/markers/stored';

// Marker processing (v7) - extensibility
export { registerMarkerProcessor } from './lib/internals/materialize-markers';

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  // Core utilities - Primary helper functions
  equal,
  deepEqual,

  // Signal utilities - Signal-specific helpers
  isNodeAccessor,
  isAnySignal,
  toWritableSignal,

  // Helper functions - Path parsing and composition
  parsePath,
  composeEnhancers,
  isBuiltInObject,

  // Advanced utilities - For library extensions and plugins
  createLazySignalTree,
} from './lib/utils';

// ============================================
// EDIT SESSION EXPORTS
// ============================================

/**
 * EditSession for tracking changes to a single value with undo/redo.
 * Unlike `timeTravel()` which tracks the entire tree, EditSession is for
 * isolated value editing (forms, entities, component-level state).
 *
 * @see {@link createEditSession} for creating an edit session
 * @see {@link EditSession} for the interface definition
 */
export {
  createEditSession,
  type EditSession,
  type UndoRedoHistory,
} from './lib/edit-session';

// PathNotifier exports - For internal use by enhancers (e.g., guardrails)
export { getPathNotifier } from './lib/path-notifier';

// ============================================
// SECURITY EXPORTS
// ============================================

/**
 * Security utilities for preventing common vulnerabilities
 * @see {@link SecurityValidator} for validation and sanitization
 * @see {@link SecurityPresets} for common security configurations
 */
export {
  SecurityValidator,
  SecurityPresets,
  type SecurityEvent,
  type SecurityEventType,
  type SecurityValidatorConfig,
} from './lib/security/security-validator';

// ============================================
// MEMORY MANAGEMENT EXPORTS
// ============================================
// ENHANCER EXPORTS
// ============================================

/**
 * Enhancer creation and composition utilities
 * @see {@link createEnhancer} for creating enhancers with metadata
 * @see {@link resolveEnhancerOrder} for dependency resolution
 */
export { createEnhancer, resolveEnhancerOrder } from './enhancers/index';

/**
 * Enhancer metadata symbol for third-party compatibility
 */
export { ENHANCER_META } from './lib/types';

// ============================================
// INDIVIDUAL ENHANCER EXPORTS
// ============================================

/**
 * Batching enhancer for high-performance state updates
 *
 * IMPORTANT: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 *
 * @see {@link batching} for intelligent batching capabilities
 */
export {
  batching,
  batchingWithConfig,
  highPerformanceBatching,
  flushBatchedUpdates,
  hasPendingUpdates,
  getBatchQueueSize,
} from './enhancers/batching/batching';

export type { BatchingConfig, BatchingMethods } from './lib/types';

/**
 * Memoization enhancer for performance optimization
 * @see {@link memoization} for intelligent memoization capabilities
 */
export {
  memoization,
  selectorMemoization,
  computedMemoization,
  deepStateMemoization,
  highFrequencyMemoization,
  highPerformanceMemoization,
  lightweightMemoization,
  shallowMemoization,
  memoize,
  memoizeShallow,
  memoizeReference,
  clearAllCaches,
  getGlobalCacheStats,
} from './enhancers/memoization/memoization';

/**
 * Time travel enhancer for debugging and undo/redo functionality
 * @see {@link timeTravel} for time travel capabilities
 */
export {
  timeTravel,
  enableTimeTravel,
} from './enhancers/time-travel/time-travel';

/**
 * Entities enhancer for normalized collection helpers
 * @see {@link entities}
 */
export {
  entities,
  enableEntities,
  highPerformanceEntities,
} from './enhancers/entities/entities';

/**
 * Serialization enhancer for state persistence and restoration
 * Primary v6 exports: `serialization()` and `persistence()`.
 */
export {
  serialization,
  enableSerialization,
  persistence,
  createStorageAdapter,
  createIndexedDBAdapter,
  applySerialization,
  applyPersistence,
} from './enhancers/serialization/serialization';

/**
 * DevTools enhancer for development and debugging
 * @see {@link devTools} for development tools and Redux DevTools integration
 */
export {
  devTools,
  enableDevTools,
  fullDevTools,
  productionDevTools,
} from './enhancers/devtools/devtools';

/**
 * Async operation helpers
 * @see {@link createAsyncOperation} for async operation management
 */
export { createAsyncOperation, trackAsync } from './lib/async-helpers';

/**
 * Preset configurations for common use cases
 * @see {@link createPresetConfig} for preset configuration
 */
export {
  TREE_PRESETS,
  createPresetConfig,
  validatePreset,
  getAvailablePresets,
  combinePresets,
  createDevTree,
} from './enhancers/presets/lib/presets';

// ============================================
// CONSTANTS EXPORTS
// ============================================

/**
 * Configuration constants and error messages
 * Exposed for library extensions and debugging
 * @see {@link SIGNAL_TREE_CONSTANTS} for configuration values
 * @see {@link SIGNAL_TREE_MESSAGES} for error/warning messages
 */
export { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './lib/constants';

// ============================================
// PUBLIC API SUMMARY
// ============================================

/**
 * SignalTree Core API Summary:
 *
 * **Main Factory:**
 * - `signalTree(state, config?)` - Create a reactive signal tree
 *
 * **Core Types:**
 * - `SignalTree<T>` - Main interface for signal trees
 * - `TreeNode<T>` - Type transformation for nested signals
 * - `TreeConfig` - Configuration options
 *
 * **Utilities:**
 * - `equal()` / `deepEqual()` - Comparison functions
 *
 * **Enhancer System:**
 * - `createEnhancer()` - Create enhancers with metadata
 * - `composeEnhancers()` - Combine multiple enhancers
 *
 * **Advanced:**
 * - `createLazySignalTree()` - For performance optimizations
 * - Constants and messages for extensions
 *
 * @example Basic Usage
 * ```typescript
 * import { signalTree } from '@signaltree/core';
 *
 * const state = signalTree({ count: 0, user: { name: 'John' } });
 *
 * // Access signals
 * console.log(state.count()); // 0
 * console.log(state.user.name()); // 'John'
 *
 * // Update values
 * state.count.set(5);
 * state.user.name.set('Jane');
 * ```
 *
 * @example With Enhancers (using .with() chain - recommended)
 * ```typescript
 * import { signalTree, entityMap } from '@signaltree/core';
 * // Note: `.with(entities())` was deprecated in v6 and removed in v7; entityMap is auto-processed.
 *
 * // Chain enhancers with .with() for type-safe composition
 * const state = signalTree({ count: 0 })
 *   // .with(logging());
 *
 * // Combine multiple enhancers
 * interface AppState { users: entityMap<User> }
 * const store = signalTree<AppState>({ users: entityMap<User>() })
 *   .with(entities())
 *   // .with(logging());
 *
 * // Access entity methods via tree.$
 * store.$.users.add({ id: 1, name: 'Alice' });
 * const user = store.$.users.byId(1)();
 * ```
 */
