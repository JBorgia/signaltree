import {
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  type Signal,
  untracked,
  type WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  from,
  isObservable,
  merge,
  Observable,
  of,
  Subject,
  Subscription,
  throwError,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

// =============================================================================
// SYMBOL
// =============================================================================

export const ASYNC_QUERY_MARKER = Symbol('ASYNC_QUERY_MARKER');

// =============================================================================
// TYPES
// =============================================================================

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

/**
 * The materialized async-query accessor.
 *
 * Calling the accessor as a function (`store.$.search()`) returns the current
 * result value. Sub-properties drive inputs and observe status.
 *
 * - `.input` — writable signal driving the query
 * - `.results` / `.data` — read-only result signal
 * - `.loading` — true while the query is in-flight
 * - `.error` — last error (null when none)
 *
 * Methods:
 *
 * - `.rerun()` — fire the query with the current input again (skip dedup)
 * - `.reset()` — clear input, result, loading, and error
 */
export interface AsyncQuerySignal<TInput, TResult> {
  (): TResult | undefined;
  /** Writable input — every change drives the (debounced) query. */
  readonly input: WritableSignal<TInput | undefined>;
  /** Read-only result signal. */
  readonly results: Signal<TResult | undefined>;
  /** Alias for `results` to match the asyncSource shape. */
  readonly data: Signal<TResult | undefined>;
  /** Loading state. */
  readonly loading: Signal<boolean>;
  /** Last error (null when none). */
  readonly error: Signal<unknown | null>;
  /** Fire the query with the current input again, bypassing dedup. */
  rerun(): void;
  /** Reset input, result, loading, and error to initial state. */
  reset(): void;
}

// =============================================================================
// MARKER FACTORY (self-registering for tree-shaking)
// =============================================================================

let asyncQueryRegistered = false;

/**
 * Creates an `asyncQuery` marker — a SignalTree-native input-driven query
 * primitive. Wire your reactive input signal, get debounced/deduped queries
 * automatically piped through a switchMap pipeline.
 *
 * Place anywhere in your tree literal. The marker materializes into a fully
 * functional {@link AsyncQuerySignal} at that path during tree construction.
 *
 * @example Debounced search
 * ```typescript
 * const store = signalTree({
 *   search: asyncQuery<string, User[]>({
 *     initialResult: [],
 *     debounce: 300,
 *     filter: (q) => q.length > 0,
 *     query: (q) => this.api.search$(q),
 *   }),
 * });
 *
 * // Wire to a form input via ngModel:
 * <input [(ngModel)]="store.$.search.input">
 *
 * // Or push values imperatively:
 * store.$.search.input.set('alice');
 *
 * // Observe results:
 * store.$.search();           // User[] | undefined
 * store.$.search.results();   // same
 * store.$.search.loading();
 * ```
 *
 * @example Plain async (no debounce)
 * ```typescript
 * const store = signalTree({
 *   user: asyncQuery<number, User>({
 *     query: (id) => this.api.getUser$(id),
 *   }),
 * });
 *
 * store.$.user.input.set(42);
 * ```
 */
export function asyncQuery<TInput, TResult>(
  config: AsyncQueryConfig<TInput, TResult>
): AsyncQueryMarker<TInput, TResult> {
  if (!asyncQueryRegistered) {
    asyncQueryRegistered = true;
    registerBuiltinMarkerProcessor(isAsyncQueryMarker, createAsyncQuerySignal);
  }
  return {
    [ASYNC_QUERY_MARKER]: true,
    config,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

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

// =============================================================================
// SIGNAL FACTORY (materializer)
// =============================================================================

/**
 * Materializes an {@link AsyncQueryMarker} into a working {@link AsyncQuerySignal}.
 */
export function createAsyncQuerySignal<TInput, TResult>(
  marker: AsyncQueryMarker<TInput, TResult>
): AsyncQuerySignal<TInput, TResult> {
  const {
    initialInput,
    initialResult,
    query,
    debounce = 0,
    filter: predicate,
    equal = Object.is,
  } = marker.config;

  const inputSignal: WritableSignal<TInput | undefined> = signal<
    TInput | undefined
  >(initialInput);
  const resultsSignal: WritableSignal<TResult | undefined> = signal<
    TResult | undefined
  >(initialResult);
  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<unknown | null>(null);

  let destroyed = false;
  const trigger$ = new Subject<TInput>(); // input-driven path (debounced + deduped)
  const rerun$ = new Subject<TInput>(); // explicit rerun() — bypasses debounce + dedup

  // Best-effort DestroyRef binding.
  let destroyRef: DestroyRef | null = null;
  try {
    destroyRef = inject(DestroyRef, { optional: true }) ?? null;
  } catch {
    destroyRef = null;
  }
  destroyRef?.onDestroy(() => {
    destroyed = true;
    trigger$.complete();
    rerun$.complete();
  });

  // Input-driven path: optional debounce → optional filter → dedup.
  const deduped$: Observable<TInput> = trigger$.pipe(
    debounce > 0 ? debounceTime(debounce) : tap(),
    predicate ? filter(predicate) : tap(),
    distinctUntilChanged(equal)
  );

  // rerun() is an explicit, imperative re-fire: merge it in AFTER dedup so it
  // bypasses debounce + distinctUntilChanged and always re-runs the current input.
  //
  // Errors are caught INSIDE switchMap, per query, and mapped to an outcome
  // object. This is load-bearing: if a query error escaped switchMap it would
  // terminate the outer subscription, and the pipeline would silently stop
  // responding to all future inputs. Containing it here keeps the stream alive.
  const pipeline$ = merge(deduped$, rerun$).pipe(
    tap(() => {
      loadingSignal.set(true);
      errorSignal.set(null);
    }),
    switchMap((input) => {
      let query$: Observable<TResult>;
      try {
        const r = query(input);
        query$ = isObservable(r) ? (r as Observable<TResult>) : from(r);
      } catch (err) {
        // Synchronous throw from the query factory.
        query$ = throwError(() => err);
      }
      return query$.pipe(
        map((value) => ({ ok: true as const, value })),
        catchError((error) => of({ ok: false as const, error }))
      );
    }),
    tap((outcome) => {
      if (destroyed) return;
      if (outcome.ok) {
        resultsSignal.set(outcome.value);
        errorSignal.set(null);
      } else {
        errorSignal.set(outcome.error);
      }
      loadingSignal.set(false);
    })
  );

  // Subscribe with auto-cleanup. With per-query error containment above, the
  // outer stream should never error; the handler is kept as a defensive backstop.
  const sub: Subscription = (destroyRef
    ? pipeline$.pipe(takeUntilDestroyed(destroyRef))
    : pipeline$
  ).subscribe({
    error: (err) => {
      if (destroyed) return;
      errorSignal.set(err);
      loadingSignal.set(false);
    },
  });
  void sub;

  // Wire input signal → trigger$ via an effect so signal changes drive queries.
  try {
    effect(
      () => {
        const v = inputSignal();
        if (v === undefined) return;
        untracked(() => trigger$.next(v));
      },
      { manualCleanup: false }
    );
  } catch {
    // Outside injection context. The caller can still use .rerun() manually
    // or set input which will simply not auto-trigger.
  }

  const fn = (() => resultsSignal()) as AsyncQuerySignal<TInput, TResult>;
  Object.defineProperty(fn, 'input', { value: inputSignal });
  Object.defineProperty(fn, 'results', { value: resultsSignal.asReadonly() });
  Object.defineProperty(fn, 'data', { value: resultsSignal.asReadonly() });
  Object.defineProperty(fn, 'loading', { value: loadingSignal.asReadonly() });
  Object.defineProperty(fn, 'error', { value: errorSignal.asReadonly() });
  fn.rerun = () => {
    const cur = inputSignal();
    if (cur !== undefined) rerun$.next(cur);
  };
  fn.reset = () => {
    loadingSignal.set(false);
    errorSignal.set(null);
    resultsSignal.set(initialResult);
    inputSignal.set(initialInput);
  };

  return fn;
}

// Reserved for future enhancement (per-tree injectors).
void Injector;
