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

/**
 * Wrap a tree factory in an injectable Angular service (the idiomatic Angular
 * DI pattern for a tree; comparable to NgRx SignalStore's `signalStore()`).
 * @see {@link defineStore}
 */
export { defineStore, type DefineStoreConfig } from './lib/define-store';

/**
 * Type-only read-only narrowing of a tree — same runtime object, no write
 * path offered on the type. The primary readonly surface;
 * `defineStore(factory, { expose: 'readonly' })` is sugar over the same view.
 * @see {@link asReadonly}
 */
export {
  asReadonly,
  // Per-marker reader-key allowlists (const) — the `Pick` sources for the
  // readonly views; importable by parity fixtures.
  ENTITY_READERS,
  ENTITY_LOADER_READERS,
  STATUS_READERS,
  FORM_READERS,
  FORM_WIZARD_READERS,
  STORED_READERS,
  ASYNC_SOURCE_READERS,
  ASYNC_QUERY_READERS,
  type ReadonlyStore,
  type ReadonlyView,
  type ReadonlyNodeAccessor,
  type ReadonlyEntityNode,
  type ReadonlyEntitySignal,
  type ReadonlyEntityLoaderSurface,
  type ReadonlyLoadingEntitySignal,
  type ReadonlyStatusSignal,
  type ReadonlyFormSignal,
  type ReadonlyFormWizard,
  type ReadonlyStoredSignal,
  type ReadonlyAsyncSourceSignal,
  type ReadonlyAsyncQuerySignal,
} from './lib/readonly';

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

  // Update metadata (lifted from guardrails in v9.3 for cross-enhancer use)
  UpdateMetadata,
} from './lib/types';

// Enhancer-author plumbing (EnhancerMeta, withWriteContext,
// getActiveWriteContext, interceptLeafSignals) was removed from the root barrel
// in v12 — import it from '@signaltree/core/authoring'.

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
export { derivedFrom } from './lib/internals/derived-types';

/**
 * Derived-but-writable signal, comparable to NgRx SignalStore's `withLinkedState`.
 * Use inside `.derived($ => ({ ... }))`; wraps Angular's native `linkedSignal`.
 * @see {@link linked}
 */
export { linked, type LinkedOptions } from './lib/linked';

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
// createFormSignal moved to '@signaltree/core/authoring' in 11.6.0
// (authoring-only factory, zero application consumers).
export {
  form,
  isFormMarker,
  validators,
  withKind,
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

// Async-source marker (v9.5) - load-and-expose async primitive
// createAsyncSourceSignal moved to '@signaltree/core/authoring' in 11.6.0
// (authoring-only factory, zero application consumers).
export {
  asyncSource,
  isAsyncSourceMarker,
  ASYNC_SOURCE_MARKER,
  type AsyncSourceMarker,
  type AsyncSourceSignal,
  type AsyncSourceConfig,
  type AsyncSourceLoader,
} from './lib/markers/async-source';

// Async-query marker (v9.5) - input-driven debounced query primitive
// createAsyncQuerySignal moved to '@signaltree/core/authoring' in 11.6.0
// (authoring-only factory, zero application consumers).
export {
  asyncQuery,
  isAsyncQueryMarker,
  ASYNC_QUERY_MARKER,
  type AsyncQueryMarker,
  type AsyncQuerySignal,
  type AsyncQueryConfig,
  type AsyncQueryFn,
} from './lib/markers/async-query';

// Cache-aware (single-scope) loading for entityMap (RFC 0002/0003). `entityMap({ load, … })`
// turns a plain collection into a self-loading, cache-aware one; `invalidateTag`
// is the push-invalidation seam. `entityMap` is exported above (from ./lib/types).
export {
  invalidateTag,
  type EntityLoader,
  type EntityLoadOptions,
  type EntityLoaderSurface,
  type EntityPersist,
  type EntityStorageAdapter,
} from './lib/markers/entity-loader';
// `loader()` — the tree-shakeable way to make an entityMap cache-aware (RFC 0005 §6).
// Importing `entityMap` WITHOUT `loader` shakes the loader machinery out; the
// branded `LoaderFeature` it returns is the only static reference to `attachLoader`.
export { loader, type LoaderOptions } from './lib/markers/loader';
export type { LoaderFeature } from './lib/types';
export type {
  LoadingEntityMapMarker,
  LoadingEntitySignal,
} from './lib/types';

// Async-stream marker — EXPERIMENTAL, intentionally NOT exported from the public
// barrel. Per RFC 0001 (docs/rfcs/0001-ai-embedded-boundary.md §5) streaming
// stays experimental until there's a real demand signal, and the eventual public
// shape (a distinct `asyncStream` marker vs an `accumulate` option on
// `asyncSource`) is deferred. The implementation + tests live in
// ./lib/markers/async-stream.ts; re-export here to promote it when warranted.

// Marker processing (v7): `registerMarkerProcessor` was removed from the root
// barrel in v12 — import it from '@signaltree/core/authoring'.

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
  isTraversableNode,
  toWritableSignal,

  // Helper functions - Path parsing
  parsePath,
  isBuiltInObject,
} from './lib/utils';

// `composeEnhancers`, `getPathNotifier` — removed from the root barrel in v12;
// import from '@signaltree/core/authoring'.

// ============================================
// EDIT SESSION (subpath: @signaltree/core/edit-session)
// ============================================

// Moved to '@signaltree/core/edit-session' in v9.
// Import from there to reduce main bundle size.

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

// `createEnhancer`, `resolveEnhancerOrder`, `ENHANCER_META` — enhancer-author
// plumbing removed from the root barrel in v12; import from
// '@signaltree/core/authoring'.

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

// The `effects()` enhancer was removed in v12 — a SignalTree is made of
// ordinary Angular signals, so use native `effect(() => tree.$.path())`
// (proper injection-context handling; no NG0203 footgun).

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
 * - `timeTravel(config?)` - Undo/redo
 * - `devTools(config?)` - Redux DevTools integration
 * - `serialization(config?)` - State serialization
 * - `persistence(config?)` - State persistence
 *
 * **Derived State:**
 * - `.derived($)` - Add computed state to tree
 * - `derivedFrom()` - Helper for separate files
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
