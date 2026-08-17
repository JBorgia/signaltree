import type { Observable } from 'rxjs';

/**
 * `asyncQuery()` — the FRAMEWORK-NEUTRAL half: identity, the query-function
 * signature, configuration, the descriptor shape, and the type guard.
 *
 * Fifth and final marker split, and the one held back deliberately: unlike the
 * other four, `asyncQuery`'s realization owns LIFECYCLE, not merely reactive
 * storage. `createAsyncQuerySignal` injects a `DestroyRef`, pipes through
 * `takeUntilDestroyed`, holds an rxjs `Subscription` and creates an `effect`.
 *
 * Measured before splitting: every one of those sits inside
 * `createAsyncQuerySignal`. Nothing in the descriptor region or the guard
 * creates, destroys, retriggers or subscribes anything. So the lifecycle stays
 * whole on the realization side and this remains a file move — had any of it
 * been reachable from the descriptor, the split would have been semantic drift
 * and the right answer would have been to stop.
 *
 * Staying in `async-query.ts`: `AsyncQuerySignal` (realized accessor type),
 * `asyncQuery()` (its lazy builtin registration names the realization), and
 * `createAsyncQuerySignal` with all of the lifecycle above.
 */

export const ASYNC_QUERY_MARKER = Symbol('ASYNC_QUERY_MARKER');

/**
 * Query function for an async query. Receives the current input and returns
 * either an Observable or a Promise of the result.
 */
export type AsyncQueryFn<TInput, TResult> = (
  input: TInput
) => Observable<TResult> | Promise<TResult>;

/**
 * Configuration for an {@link asyncQuery} marker.
 */
export interface AsyncQueryConfig<TInput, TResult> {
  /** Initial input value (default: `undefined` — query won't fire until set). */
  initialInput?: TInput;
  /** Initial result value (default: `undefined`). */
  initialResult?: TResult;
  /** Query function — runs every time input changes (after debounce/dedup). */
  query: AsyncQueryFn<TInput, TResult>;
  /** Debounce input changes by N ms (default: 0 — no debounce). */
  debounce?: number;
  /** Filter inputs — query only fires when this returns true. */
  filter?: (input: TInput) => boolean;
  /** Equality function for deduping consecutive inputs (default: `Object.is`). */
  equal?: (a: TInput, b: TInput) => boolean;
}

/**
 * Marker placeholder that gets materialized into an {@link AsyncQuerySignal}.
 */
export interface AsyncQueryMarker<TInput, TResult> {
  [ASYNC_QUERY_MARKER]: true;
  config: AsyncQueryConfig<TInput, TResult>;
  readonly __inputType?: TInput;
  readonly __resultType?: TResult;
}

export function isAsyncQueryMarker(
  value: unknown
): value is AsyncQueryMarker<unknown, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    ASYNC_QUERY_MARKER in value &&
    (value as Record<symbol, unknown>)[ASYNC_QUERY_MARKER] === true
  );
}
