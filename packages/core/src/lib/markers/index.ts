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
