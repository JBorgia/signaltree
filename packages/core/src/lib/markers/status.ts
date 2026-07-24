import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

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

  // Derived predicate signals — bare names, matching FormControl / signals /
  // asyncSource / entityMap / form. (The `is`-prefix aliases were removed in v11.)
  /** True when state is NotLoaded */
  notLoaded: Signal<boolean>;
  /** True when state is Loading */
  loading: Signal<boolean>;
  /** True when state is Loaded */
  loaded: Signal<boolean>;
  /** True when state is Error (i.e. error !== null) */
  hasError: Signal<boolean>;
  /**
   * True when the collection is neither loading nor loaded — i.e. it should
   * be (re)fetched. Covers **both** `NotLoaded` AND `Error`, which is the
   * whole point: this is THE guard/resolver predicate for "should I fetch?".
   *
   * Reach for `idle()`, not `notLoaded()`, in a guard/resolver:
   * `notLoaded()` is strictly `state === NotLoaded`, so it is **false** once
   * `setError()` has moved the collection to the distinct `Error` state — a
   * `notLoaded()`-gated fetch therefore **silently never retries after an
   * error**. `idle()` is exactly `!loading() && !loaded()`, so it stays true
   * in the error state and the fetch retries.
   *
   * Prefer this predicate over `state() === LoadingState.X` comparisons —
   * enum-equality reads are a codegen hallucination magnet (see README).
   */
  idle: Signal<boolean>;
  /**
   * True once the operation has finished — **either** `Loaded` OR `Error`
   * (i.e. `loaded() || hasError()`). The "stop the spinner / the request is
   * done" predicate, the settled counterpart to {@link idle}.
   *
   * Note `idle` and `settled` deliberately **overlap** in the `Error` state:
   * an errored request is both *done* (`settled`) and *should be retried*
   * (`idle`). Truth table — `idle` / `loading` / `settled`:
   * NotLoaded = T/F/F · Loading = F/T/F · Loaded = F/F/T · Error = T/F/T.
   * This is the closed set of standard composite predicates; anything more
   * app-specific composes over these via `.derived()`.
   */
  settled: Signal<boolean>;

  // Canonical helper methods
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

  // v10.2 — Promise-vocabulary aliases.
  // AI coding agents trained on Promise-state vocabularies (success/start/fail)
  // frequently reach for these method names instead of the canonical setLoaded/
  // setLoading/setError. Rather than fight the linguistic gravity, we accept
  // both names. The aliases are documented as equivalent and have identical
  // semantics — no second source of truth, just additional vocabulary.

  /** Alias for {@link setLoading}. */
  start(): void;
  /** Alias for {@link setLoaded}. */
  setSuccess(): void;
  /** Alias for {@link setLoaded}. */
  succeed(): void;
  /** Alias for {@link setError}. */
  fail(error: E): void;
}

// =============================================================================
// MARKER FACTORY (Self-registering for tree-shaking)
// =============================================================================

/** @internal - Tracks if processor is registered */
let statusRegistered = false;

/**
 * Creates a status marker for async operation state tracking.
 *
 * Automatically registers its processor on first use - no manual
 * registration required. If you never use `status()`, the processor
 * is tree-shaken out of your bundle.
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
  // Self-register on first use (tree-shakeable)
  if (!statusRegistered) {
    statusRegistered = true;
    registerBuiltinMarkerProcessor(isStatusMarker, createStatusSignal);
  }

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

  // Lazy computed signals — one per predicate, created on first access (no
  // duplicate computation, no double allocation).
  let _notLoaded: Signal<boolean> | null = null;
  let _loading: Signal<boolean> | null = null;
  let _loaded: Signal<boolean> | null = null;
  let _hasError: Signal<boolean> | null = null;
  let _idle: Signal<boolean> | null = null;
  let _settled: Signal<boolean> | null = null;

  const getNotLoaded = () =>
    (_notLoaded ??= computed(() => stateSignal() === LoadingState.NotLoaded));
  const getLoading = () =>
    (_loading ??= computed(() => stateSignal() === LoadingState.Loading));
  const getLoaded = () =>
    (_loaded ??= computed(() => stateSignal() === LoadingState.Loaded));
  const getHasError = () =>
    (_hasError ??= computed(() => stateSignal() === LoadingState.Error));
  // "should I (re)fetch?" — true unless actively loading or already loaded, so
  // it stays true in the Error state (unlike notLoaded). NOT derived from
  // notLoaded/hasError: expressed directly as !loading && !loaded so a future
  // added state can't silently make it wrong.
  const getIdle = () =>
    (_idle ??= computed(
      () =>
        stateSignal() !== LoadingState.Loading &&
        stateSignal() !== LoadingState.Loaded
    ));
  // "is it done?" — Loaded OR Error. The settled counterpart to idle;
  // expressed directly so it can't drift if a state is ever added.
  const getSettled = () =>
    (_settled ??= computed(
      () =>
        stateSignal() === LoadingState.Loaded ||
        stateSignal() === LoadingState.Error
    ));

  return {
    // Source signals
    state: stateSignal,
    error: errorSignal,

    // v10.3 canonical (bare) — preferred
    get notLoaded() {
      return getNotLoaded();
    },
    get loading() {
      return getLoading();
    },
    get loaded() {
      return getLoaded();
    },
    get hasError() {
      return getHasError();
    },
    get idle() {
      return getIdle();
    },
    get settled() {
      return getSettled();
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

    // v10.2 — Promise-vocabulary aliases. Identical semantics to the canonical
    // methods above; included because AI agents (and humans coming from
    // Promise-state libraries) consistently reach for these names.
    start() {
      stateSignal.set(LoadingState.Loading);
      errorSignal.set(null);
    },
    setSuccess() {
      stateSignal.set(LoadingState.Loaded);
      errorSignal.set(null);
    },
    succeed() {
      stateSignal.set(LoadingState.Loaded);
      errorSignal.set(null);
    },
    fail(err: E) {
      stateSignal.set(LoadingState.Error);
      errorSignal.set(err);
    },
  };
}
