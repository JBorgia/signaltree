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
  TreeNode,
  CallableWritableSignal,
  AccessibleNode,
  NodeAccessor,
  Primitive,
  NotFn,

  // Deep path types - For nested entity access (removed in v6)

  // Configuration types
  TreeConfig,

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

  // Lifecycle
  EnhancerCleanup,

  // Effects
  EffectsMethods,
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
  createStorageKeys,
  clearStoragePrefix,
  type StoredMarker,
  type StoredSignal,
  type StoredOptions,
} from './lib/markers/stored';

// Form marker (v7.2) - tree-integrated forms with validation
export {
  form,
  isFormMarker,
  createFormSignal,
  validators,
  FORM_MARKER,
  type FormMarker,
  type FormSignal,
  type FormConfig,
  type FormFields,
  type FormWizard,
  type WizardConfig,
  type WizardStepConfig,
  type Validator,
  type AsyncValidator,
} from './lib/markers/form';

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
} from './lib/utils';

// ============================================
// EDIT SESSION (subpath: @signaltree/core/edit-session)
// ============================================

// Moved to '@signaltree/core/edit-session' in v9.
// Import from there to reduce main bundle size.

// PathNotifier exports - For internal use by enhancers (e.g., guardrails)
export { getPathNotifier } from './lib/path-notifier';

// ============================================
// SECURITY (subpath: @signaltree/core/security)
// ============================================

// Moved to '@signaltree/core/security' in v9.
// Import from there to reduce main bundle size.

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
export { batching } from './enhancers/batching/batching';

export type { BatchingConfig, BatchingMethods } from './lib/types';

/**
 * Effects enhancer for reactive side effects and subscriptions
 * @see {@link effects} for Angular effect-based subscriptions on tree state
 */
export { effects } from './enhancers/effects/effects';
export type { EffectsConfig } from './enhancers/effects/effects';

/**
 * Time travel enhancer for debugging and undo/redo functionality
 * @see {@link timeTravel} for time travel capabilities
 */
export { timeTravel } from './enhancers/time-travel/time-travel';

/**
 * Serialization enhancer for state persistence and restoration
 */
export {
  serialization,
  persistence,
} from './enhancers/serialization/serialization';

/**
 * DevTools enhancer for development and debugging
 * @see {@link devTools} for development tools and Redux DevTools integration
 */
export { devTools } from './enhancers/devtools/devtools';

// ============================================
// CONSTANTS EXPORTS
// ============================================

/**
 * Configuration constants and error messages
 * Exposed for library extensions and debugging
 * @see {@link SIGNAL_TREE_CONSTANTS} for configuration values
 * @see {@link SIGNAL_TREE_MESSAGES} for error/warning messages
 */
export { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES, isDev } from './lib/constants';

// ============================================
// PUBLIC API SUMMARY
// ============================================

/**
 * SignalTree Core API Summary (v9):
 *
 * **Main Factory:**
 * - `signalTree(state, config?)` - Create a reactive signal tree
 *
 * **Markers (things Angular doesn't have):**
 * - `entityMap<T, K>()` - Normalized collections
 * - `status()` - Async operation state
 * - `stored(key, default)` - localStorage persistence
 * - `form(fields)` - Tree-integrated forms
 *
 * **Enhancers (one function each):**
 * - `batching(config?)` - Batch CD notifications
 * - `effects(config?)` - Reactive side effects and subscriptions
 * - `timeTravel(config?)` - Undo/redo
 * - `devTools(config?)` - Redux DevTools integration
 * - `serialization(config?)` - State serialization
 * - `persistence(config?)` - State persistence
 *
 * **Derived State:**
 * - `.derived($)` - Add computed state to tree
 * - `derivedFrom()` / `externalDerived()` - Helpers for separate files
 *
 * @example Basic Usage
 * ```typescript
 * import { signalTree } from '@signaltree/core';
 *
 * const tree = signalTree({ count: 0, user: { name: 'John' } });
 * tree.$.count();          // 0
 * tree.$.user.name();      // 'John'
 * tree.$.count.set(5);     // Update
 * ```
 *
 * @example With Enhancers
 * ```typescript
 * import { signalTree, entityMap, devTools, batching } from '@signaltree/core';
 *
 * const store = signalTree({ users: entityMap<User, number>() })
 *   .with(batching())
 *   .with(devTools({ treeName: 'MyStore' }));
 *
 * store.$.users.addOne({ id: 1, name: 'Alice' });
 * ```
 */
