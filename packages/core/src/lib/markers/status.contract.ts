/**
 * `status()` — the FRAMEWORK-NEUTRAL half: identity, the loading enum, the
 * descriptor shape, and the type guard.
 *
 * Third split, following the pattern `async-source.contract.ts` established and
 * `stored.contract.ts` proved against frozen persistence semantics. Structural
 * move only.
 *
 * `LoadingState` moves with the contract deliberately. It is a runtime enum, but
 * it is part of the DESCRIBED semantics — an extension author inspecting a
 * status marker needs to name the states — and it depends on nothing.
 *
 * `StatusSignal`, `status()` and `createStatusSignal` stay in `status.ts`: the
 * realized accessor type is expressed in `Signal`, and the factory lazily
 * registers the builtin processor, which names the Angular realization.
 *
 * Direction is one-way: realization imports contract, never the reverse.
 * Importing this file registers nothing — enforced by
 * `tools/check-contract-neutrality.mjs`.
 */

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
