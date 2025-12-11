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
  SignalTree,
  TreeNode,
  RemoveSignalMethods,
  Primitive,
  BuiltInObject,
  NotFn,

  // Deep path types - For nested entity access
  DeepPath,
  DeepAccess,

  // Configuration types
  TreeConfig,
  TreePreset,

  // Enhancer system types
  Enhancer,
  EnhancerMeta,
  EnhancerWithMeta,
  ChainResult,
  WithMethod,

  // Entity types
  EntitySignal,
  EntityMapMarker,
  EntityConfig,
  MutationOptions,
  AddOptions,
  AddManyOptions,

  // Feature types - Advanced functionality
  PerformanceMetrics,
  EntityHelpers,
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
} from './enhancers/batching/lib/batching';

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
  cleanupMemoizationCache,
  clearAllCaches,
  getGlobalCacheStats,
} from './enhancers/memoization/lib/memoization';

/**
 * Time travel enhancer for debugging and undo/redo functionality
 * @see {@link withTimeTravel} for time travel capabilities
 */
export {
  withTimeTravel,
  enableTimeTravel,
  getTimeTravel,
  type TimeTravelInterface,
} from './enhancers/time-travel/lib/time-travel';

/**
 * Entities enhancer for normalized collection helpers
 * @see {@link withEntities}
 */
export {
  withEntities,
  enableEntities,
  withHighPerformanceEntities,
} from './enhancers/entities/lib/entities';

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
} from './enhancers/serialization/lib/serialization';

/**
 * DevTools enhancer for development and debugging
 * @see {@link withDevTools} for development tools and Redux DevTools integration
 */
export {
  withDevTools,
  enableDevTools,
  withFullDevTools,
  withProductionDevTools,
} from './enhancers/devtools/lib/devtools';

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

/**
 * Computed enhancer for derived signal creation
 */
export {
  computedEnhancer,
  createComputed,
  type ComputedConfig,
  type ComputedSignal,
  type ComputedSignalTree,
} from './enhancers/computed/lib/computed';

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
 * @example With Enhancers
 * ```typescript
 * import { signalTree, createEnhancer } from '@signaltree/core';
 *
 * const logger = createEnhancer(
 *   { name: 'logger', provides: ['logging'] },
 *   (tree) => ({ ...tree, log: () => console.log(tree) })
 * );
 *
 * const state = signalTree({ count: 0 }, { enhancers: [logger] });
 * ```
 */
