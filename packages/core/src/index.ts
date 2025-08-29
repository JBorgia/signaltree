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
  DeepSignalify,
  RemoveSignalMethods,
  Primitive,
  BuiltInObject,

  // Configuration types
  TreeConfig,
  TreePreset,

  // Enhancer system types
  Enhancer,
  EnhancerMeta,
  EnhancerWithMeta,
  ChainResult,
  WithMethod,

  // Feature types - Advanced functionality
  Middleware,
  PerformanceMetrics,
  EntityHelpers,
  AsyncActionConfig,
  AsyncAction,
  TimeTravelEntry,
} from './lib/types';

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  // Core utilities - Primary helper functions
  unwrap,
  equal,
  deepEqual,

  // Signal utilities - Signal-specific helpers
  terminalSignal,

  // Helper functions - Path parsing and composition
  parsePath,
  composeEnhancers,
  isBuiltInObject,

  // Advanced utilities - For library extensions and plugins
  createLazySignalTree,
} from './lib/utils';

// ============================================
// ENHANCER EXPORTS
// ============================================

/**
 * Enhancer creation and composition utilities
 * @see {@link createEnhancer} for creating enhancers with metadata
 * @see {@link resolveEnhancerOrder} for dependency resolution
 */
export { createEnhancer, resolveEnhancerOrder } from './lib/enhancers';

/**
 * Enhancer metadata symbol for third-party compatibility
 */
export { ENHANCER_META } from './lib/types';

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
 * - `DeepSignalify<T>` - Type transformation for nested signals
 * - `TreeConfig` - Configuration options
 *
 * **Utilities:**
 * - `unwrap()` - Extract values from signals
 * - `equal()` / `deepEqual()` - Comparison functions
 * - `terminalSignal()` - Create leaf signals
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
