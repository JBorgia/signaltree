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
  // The per-marker reader-key allowlists moved to '@signaltree/core/authoring'
  // in 14.0.0. They exist to TYPE `asReadonly`; an app calls `asReadonly(tree)`
  // and never names them.
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

  // Enhancer-added method types. Exported so a DOWNSTREAM LIBRARY can name the
  // return type of its own `.with(...)` chain in its emitted .d.ts. `.with()`
  // returns `this & TAdded`, so a helper like
  // `withStandardEnhancers(tree) { return tree.with(batching()).with(devTools(...)) }`
  // infers a type referencing these interfaces; if they aren't on the barrel the
  // consumer's declaration emit can't name them and the helper has to erase its
  // own return type (losing `.batch()`/`.undo()`/… for its callers). Found via a
  // real consumer doing exactly that — see docs/audits/2026-07/.
  DevToolsMethods,
  OptimizedUpdateMethods,

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
// `entityMap()` RETURNS these — a consumer could call the most-used API in the
// library and not name what it gave them, which is the same gap the
// serialization config types had.
export type {
  EntityMapBuilder,
  LoadingEntityMapBuilder,
  DefaultKey,
  ComputedSliceConfig,
  EntityMapComputedSlices,
  EntitySignalWithSlices,
  EntityMapMarkerWithSlices,
} from './lib/markers/entity-map';
// isSignalTree lives on '@signaltree/core/authoring' with the rest of the guard
// family.

// Per-leaf equality (13.5.0)
export { compared, byKeys } from './lib/markers/compared';
export type { ComparedMarker } from './lib/markers/compared';

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
  type DerivedMarker,
  type DerivedType,
} from './lib/markers/derived';

// Status marker (v7) - async operation state
export {
  status,
  LoadingState,
  type StatusMarker,
  type StatusSignal,
  type StatusConfig,
} from './lib/markers/status';

// Stored marker (v7) - localStorage persistence
export {
  stored,
  createStorageKeys,
  clearStoragePrefix,
  flushAllStoredSignals,
  type StoredMarker,
  type StoredSignal,
  type StoredOptions,
  // The type of StoredOptions.migrate — a consumer declaring a migration
  // function could not name it.
  type MigrationFn,
  type StoredErrorContext,
  type StoredReloadResult,
} from './lib/markers/stored';

// Form marker (v7.2) - tree-integrated forms with validation
// createFormSignal moved to '@signaltree/core/authoring' in 11.6.0
// (authoring-only factory, zero application consumers).
export {
  form,
  validators,
  withKind,
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

// `history()` — signal-native undo/redo for form() markers, and the
// tree-shakeable way to add it: importing `form` WITHOUT `history` keeps the
// snapshot/undo engine out of the bundle (security()/loader() precedent, RFC 0006).
// Attaches to the marker's values signal, so it also drives a bound signalForm().
export { history, trackHistory } from './lib/form-history/form-history';
export type {
  HistoryFeature,
  FormHistoryApi,
  FormHistoryOptions,
  FormHistorySnapshot,
} from './lib/types';

// Audit tracker — framework-agnostic tree change logging (moved from
// @signaltree/ng-forms in v13, RFC 0006). Tree-shakeable: unused → not bundled.
export {
  createAuditTracker,
  createAuditCallback,
  type AuditEntry,
  type AuditMetadata,
  type AuditTrackerConfig,
} from './lib/audit/audit';

// Async-source marker (v9.5) - load-and-expose async primitive
// createAsyncSourceSignal moved to '@signaltree/core/authoring' in 11.6.0
// (authoring-only factory, zero application consumers).
export {
  asyncSource,
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
export type { LoadingEntityMapMarker, LoadingEntitySignal } from './lib/types';

// Async-stream marker — DELETED in 14.0.0, along with its implementation and
// tests. It sat here unexported for several releases while the API question (a
// distinct `asyncStream` marker vs an `accumulate` option on `asyncSource`) went
// unanswered, and leaving 372 lines of one candidate in the tree biased that
// decision toward itself without anyone choosing.
//
// Accumulation is three lines of composition over a plain leaf — and a leaf is
// captured by timeTravel(), appears in tree(), and persists with no marker
// contract to satisfy, which a marker has to earn individually. See
// docs/guides/streaming-accumulation.md. Git has the implementation if the
// answer ever turns out to be "marker".

// Marker processing (v7): `registerMarkerProcessor` was removed from the root
// barrel in v12 — import it from '@signaltree/core/authoring'.

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  // Core utilities - Primary helper functions
  // `equal` (an alias of `deepEqual`) was removed in 15.0.0 — see deep-equal.ts.
  deepEqual,
  toWritableSignal,
  // isNodeAccessor / isAnySignal / isTraversableNode / isBuiltInObject /
  // parsePath moved to '@signaltree/core/authoring' in 14.0.0 — you reach for a
  // structural guard when you are walking a tree, which is authoring work.
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
// `persistence(config)` REQUIRES a config and `serialization(config?)` accepts
// one, but neither type was exported — a consumer could call them and not
// declare the object they pass, nor name the methods they gain.
export type {
  SerializationConfig,
  SerializationMethods,
  PersistenceConfig,
  PersistenceMethods,
  SerializedState,
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
// SIGNAL_TREE_CONSTANTS / SIGNAL_TREE_MESSAGES moved to
// '@signaltree/core/authoring' in 14.0.0; `isDev` stays, since an app legitimately
// branches on it.
export { isDev } from './lib/constants';

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
