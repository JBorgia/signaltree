/**
 * SignalTree Markers
 *
 * Marker functions define special state types that are processed
 * during tree finalization. Markers are placeholder objects that
 * get transformed into fully functional signals with methods.
 *
 * Available markers:
 * - entityMap<T, K>() - Normalized entity collections with CRUD
 * - status() - Async operation state (loading, error, helpers)
 * - stored(key, default) - Auto-sync to localStorage
 * - form<T>(config) - Tree-integrated forms with validation, wizard, persistence
 *
 * Note: derived() function was removed in v6.3.1 - use computed() directly
 */

// Derived state types (derived() function removed - use computed() directly)
export {
  isDerivedMarker,
  getDerivedMarkerSymbol,
  type DerivedMarker,
  type DerivedType,
} from './derived';

// Status marker - async operation state (v7)
export {
  status,
  isStatusMarker,
  createStatusSignal,
  LoadingState,
  STATUS_MARKER,
  type StatusMarker,
  type StatusSignal,
  type StatusConfig,
} from './status';

// Stored marker - localStorage persistence (v7)
export {
  stored,
  isStoredMarker,
  createStoredSignal,
  createStorageKeys,
  clearStoragePrefix,
  STORED_MARKER,
  type StoredMarker,
  type StoredSignal,
  type StoredOptions,
  type MigrationFn,
} from './stored';

// Form marker - tree-integrated forms (v7.2)
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
} from './form';

// Async-source marker - load-and-expose async primitive (v9.5)
export {
  asyncSource,
  isAsyncSourceMarker,
  createAsyncSourceSignal,
  ASYNC_SOURCE_MARKER,
  type AsyncSourceMarker,
  type AsyncSourceSignal,
  type AsyncSourceConfig,
  type AsyncSourceLoader,
} from './async-source';

// Async-query marker - input-driven debounced query primitive (v9.5)
export {
  asyncQuery,
  isAsyncQueryMarker,
  createAsyncQuerySignal,
  ASYNC_QUERY_MARKER,
  type AsyncQueryMarker,
  type AsyncQuerySignal,
  type AsyncQueryConfig,
  type AsyncQueryFn,
} from './async-query';

// Single-scope freshness-managed loading for entityMap (RFC 0002/0003) — the loader surface that
// `entityMap({ load, … })` attaches. `entityMap` itself is exported from ./types.
export {
  invalidateTag,
  parseDuration,
  stableStringify,
  type EntityLoader,
  type EntityLoadOptions,
  type EntityLoaderSurface,
  type EntityPersist,
  type EntityStorageAdapter,
} from './entity-loader';
