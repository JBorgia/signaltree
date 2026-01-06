import { computed, Signal, signal, WritableSignal } from '@angular/core';

// =============================================================================
// SYMBOL & ENUM
// =============================================================================

export const STATUS_MARKER = Symbol('STATUS_MARKER');

/**
 * Loading state enum for async operations.
 */
export enum LoadingState {
  NotLoaded = 'NOT_LOADED',
  Loading = 'LOADING',
  Loaded = 'LOADED',
  Error = 'ERROR',
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration options for status marker.
 */
export interface StatusConfig {
  /** Initial loading state (default: NotLoaded) */
  initialState?: LoadingState;
}

/**
 * Status marker - placeholder in source state.
 * @typeParam E - Error type (default: Error)
 */
export interface StatusMarker<E = Error> {
  [STATUS_MARKER]: true;
  initialState: LoadingState;
  /** Phantom type for error - not used at runtime */
  readonly __errorType?: E;
}

/**
 * Materialized status signal with state, error, derived signals, and helpers.
 * @typeParam E - Error type (default: Error)
 */
export interface StatusSignal<E = Error> {
  // Source signals (writable)
  /** Current loading state */
  state: WritableSignal<LoadingState>;
  /** Current error (null if no error) */
  error: WritableSignal<E | null>;

  // Derived signals (read-only)
  /** True when state is NotLoaded */
  isNotLoaded: Signal<boolean>;
  /** True when state is Loading */
  isLoading: Signal<boolean>;
  /** True when state is Loaded */
  isLoaded: Signal<boolean>;
  /** True when state is Error */
  isError: Signal<boolean>;

  // Helper methods
  /** Set state to NotLoaded and clear error */
  setNotLoaded(): void;
  /** Set state to Loading and clear error */
  setLoading(): void;
  /** Set state to Loaded and clear error */
  setLoaded(): void;
  /** Set state to Error and store the error */
  setError(error: E): void;
  /** Reset to NotLoaded (alias for setNotLoaded) */
  reset(): void;
}

// =============================================================================
// MARKER FACTORY
// =============================================================================

/**
 * Creates a status marker for async operation state tracking.
 *
 * @typeParam E - Error type (default: Error). Use custom error types like NotifyErrorModel.
 * @param initialState - Initial loading state (default: NotLoaded)
 * @returns StatusMarker to be processed during tree finalization
 *
 * @example
 * ```typescript
 * // Default error type (Error)
 * signalTree({
 *   tickets: {
 *     entities: entityMap<Ticket>(),
 *     status: status()
 *   }
 * })
 *
 * // Custom error type
 * signalTree({
 *   tickets: {
 *     entities: entityMap<Ticket>(),
 *     status: status<NotifyErrorModel>()
 *   }
 * })
 *
 * // With initial state
 * signalTree({
 *   data: {
 *     status: status<MyError>(LoadingState.Loading)
 *   }
 * })
 * ```
 */
export function status<E = Error>(
  initialState: LoadingState = LoadingState.NotLoaded
): StatusMarker<E> {
  return {
    [STATUS_MARKER]: true,
    initialState,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

/**
 * Type guard to check if a value is a status marker.
 */
export function isStatusMarker(value: unknown): value is StatusMarker {
  return (
    value !== null &&
    typeof value === 'object' &&
    STATUS_MARKER in value &&
    (value as Record<symbol, unknown>)[STATUS_MARKER] === true
  );
}

// =============================================================================
// SIGNAL FACTORY
// =============================================================================

/**
 * Creates a materialized StatusSignal from a StatusMarker.
 *
 * @typeParam E - Error type (default: Error)
 * @param marker - The status marker with configuration
 * @returns Fully functional StatusSignal
 */
export function createStatusSignal<E = Error>(
  marker: StatusMarker<E>
): StatusSignal<E> {
  const stateSignal = signal<LoadingState>(marker.initialState);
  const errorSignal = signal<E | null>(null);

  // Lazy computed signals - only created on first access
  // This avoids creating 4 computed signals per status marker upfront
  let _isNotLoaded: Signal<boolean> | null = null;
  let _isLoading: Signal<boolean> | null = null;
  let _isLoaded: Signal<boolean> | null = null;
  let _isError: Signal<boolean> | null = null;

  return {
    // Source signals
    state: stateSignal,
    error: errorSignal,

    // Lazy derived signals - created on first access
    get isNotLoaded() {
      return (_isNotLoaded ??= computed(
        () => stateSignal() === LoadingState.NotLoaded
      ));
    },
    get isLoading() {
      return (_isLoading ??= computed(
        () => stateSignal() === LoadingState.Loading
      ));
    },
    get isLoaded() {
      return (_isLoaded ??= computed(
        () => stateSignal() === LoadingState.Loaded
      ));
    },
    get isError() {
      return (_isError ??= computed(
        () => stateSignal() === LoadingState.Error
      ));
    },

    // Helper methods
    setNotLoaded() {
      stateSignal.set(LoadingState.NotLoaded);
      errorSignal.set(null);
    },
    setLoading() {
      stateSignal.set(LoadingState.Loading);
      errorSignal.set(null);
    },
    setLoaded() {
      stateSignal.set(LoadingState.Loaded);
      errorSignal.set(null);
    },
    setError(err: E) {
      stateSignal.set(LoadingState.Error);
      errorSignal.set(err);
    },
    reset() {
      stateSignal.set(LoadingState.NotLoaded);
      errorSignal.set(null);
    },
  };
}
