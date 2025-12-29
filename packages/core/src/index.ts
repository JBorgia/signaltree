/**
 * SignalTree v1.1.6
 * A reactive state management library for Angular
 *
 * Provides reactive state management with deep signal trees, enhancer system,
 * and performance optimizations including lazy loading and batch updates.
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
} from './lib/types';

// Entity helpers (runtime)
export { entityMap } from './lib/types';

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
 * @see {@link withBatching} for intelligent batching capabilities
 */
export {
  withBatching,
  withHighPerformanceBatching,
  flushBatchedUpdates,
  hasPendingUpdates,
  getBatchQueueSize,
} from './enhancers/batching/batching';

/**
 * Memoization enhancer for performance optimization
 * @see {@link withMemoization} for intelligent memoization capabilities
 */
export {
  withMemoization,
  withSelectorMemoization,
  withComputedMemoization,
  withDeepStateMemoization,
  withHighFrequencyMemoization,
  withHighPerformanceMemoization,
  withLightweightMemoization,
  withShallowMemoization,
  memoize,
  memoizeShallow,
  memoizeReference,
  clearAllCaches,
  getGlobalCacheStats,
} from './enhancers/memoization/memoization';

/**
 * Time travel enhancer for debugging and undo/redo functionality
 * @see {@link withTimeTravel} for time travel capabilities
 */
export {
  withTimeTravel,
  enableTimeTravel,
  getTimeTravel,
} from './enhancers/time-travel/time-travel';

/**
 * Entities enhancer for normalized collection helpers
 * @see {@link withEntities}
 */
export {
  withEntities,
  enableEntities,
  withHighPerformanceEntities,
} from './enhancers/entities/entities';

/**
 * Serialization enhancer for state persistence and restoration
 * @see {@link withSerialization} for serialization capabilities
 */
export {
  withSerialization,
  enableSerialization,
  withPersistence,
  createStorageAdapter,
  createIndexedDBAdapter,
  applySerialization,
  applyPersistence,
} from './enhancers/serialization/serialization';

/**
 * DevTools enhancer for development and debugging
 * @see {@link withDevTools} for development tools and Redux DevTools integration
 */
export {
  withDevTools,
  enableDevTools,
  withFullDevTools,
  withProductionDevTools,
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
} from './lib/presets';

/**
 * Computed enhancer for derived signal creation
 */
export {
  computedEnhancer,
  createComputed,
  type ComputedConfig,
  type ComputedSignal,
  type ComputedSignalTree,
} from './enhancers/computed/computed';

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
 * import { signalTree, withLogging, withEntities, entityMap } from '@signaltree/core';
 *
 * // Chain enhancers with .with() for type-safe composition
 * const state = signalTree({ count: 0 })
 *   .with(withLogging());
 *
 * // Combine multiple enhancers
 * interface AppState { users: entityMap<User> }
 * const store = signalTree<AppState>({ users: entityMap<User>() })
 *   .with(withEntities())
 *   .with(withLogging());
 *
 * // Access entity methods via tree.$
 * store.$.users.add({ id: 1, name: 'Alice' });
 * const user = store.$.users.byId(1)();
 * ```
 */
