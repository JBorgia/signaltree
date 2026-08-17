import type { Observable } from 'rxjs';

/**
 * `asyncSource()` — the FRAMEWORK-NEUTRAL half: identity, descriptor shape, and
 * the type guard.
 *
 * WHY THIS FILE EXISTS. `@signaltree/authoring` publishes the marker identity
 * symbol and the guard so extension authors can recognise and process markers.
 * Those are semantic contracts and need no reactive framework. They were only
 * unavailable to a neutral package because they sat in the same file as
 * `createAsyncSourceSignal`, which needs Angular to build the realized signal.
 * The separation already existed conceptually; this makes it physical.
 *
 * WHAT DELIBERATELY STAYS in `async-source.ts`:
 *
 *   - `createAsyncSourceSignal` — the Angular realization. It is an
 *     implementation of the contract, not the contract.
 *   - `AsyncSourceSignal` — the REALIZED accessor type. It is described in terms
 *     of `Signal`, so it belongs with the realization that produces it.
 *   - `asyncSource()` — the authorship factory. It returns an inert descriptor,
 *     but it also lazily registers the builtin processor on first call, and that
 *     registration necessarily names the Angular realization. Moving the factory
 *     here would drag the realization back in and invert the dependency this
 *     file exists to establish. The laziness is load-bearing: it is what keeps a
 *     marker's machinery out of a bundle that never calls its factory.
 *
 * So the direction is strictly one-way — realization imports contract, never the
 * reverse.
 *
 * `rxjs` appears here as a TYPE-ONLY import. It is a separate peer from Angular
 * and does not compromise framework neutrality; the falsifier for this file is
 * "usable where `@angular/core` cannot resolve", not "zero dependencies".
 */

export const ASYNC_SOURCE_MARKER = Symbol('ASYNC_SOURCE_MARKER');

/**
 * Loader function for an async source. Returns either an Observable or a Promise.
 */
export type AsyncSourceLoader<T> = () => Observable<T> | Promise<T>;

/**
 * Configuration for an {@link AsyncSourceMarker}.
 */
export interface AsyncSourceConfig<T> {
  /** Initial value before the loader completes (default: `undefined`). */
  initial?: T;
  /** Function that produces the data — returns Observable or Promise. */
  load: AsyncSourceLoader<T>;
  /**
   * If true, skip the initial auto-load. Call `.refresh()` to trigger.
   * (default: `false` — loads automatically when the tree is materialized.)
   */
  lazy?: boolean;
}

/**
 * Marker placeholder that gets materialized into an `AsyncSourceSignal` during
 * tree construction.
 */
export interface AsyncSourceMarker<T> {
  [ASYNC_SOURCE_MARKER]: true;
  config: AsyncSourceConfig<T>;
  /** Phantom type for inference. */
  readonly __valueType?: T;
}

/**
 * Type guard for {@link AsyncSourceMarker}.
 *
 * Structural, and deliberately so: it inspects the descriptor's own identity
 * symbol and nothing else, so it works on a marker produced anywhere — including
 * in a process where no reactive framework is installed.
 */
export function isAsyncSourceMarker(
  value: unknown
): value is AsyncSourceMarker<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    ASYNC_SOURCE_MARKER in value &&
    (value as Record<symbol, unknown>)[ASYNC_SOURCE_MARKER] === true
  );
}
