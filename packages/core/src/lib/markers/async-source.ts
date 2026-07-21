import {
  DestroyRef,
  inject,
  Injector,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isObservable, type Observable, Subscription } from 'rxjs';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

// =============================================================================
// SYMBOL
// =============================================================================

export const ASYNC_SOURCE_MARKER = Symbol('ASYNC_SOURCE_MARKER');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Loader function for an async source. Returns either an Observable or a Promise.
 */
export type AsyncSourceLoader<T> = () => Observable<T> | Promise<T>;

/**
 * Configuration for an {@link asyncSource} marker.
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
 * Marker placeholder that gets materialized into an {@link AsyncSourceSignal}
 * during tree construction.
 */
export interface AsyncSourceMarker<T> {
  [ASYNC_SOURCE_MARKER]: true;
  config: AsyncSourceConfig<T>;
  /** Phantom type for inference. */
  readonly __valueType?: T;
}

/**
 * The materialized async-source accessor.
 *
 * Calling the accessor as a function (`store.$.users()`) returns the current
 * data value, matching the ergonomics of a regular signal.
 *
 * Sub-properties expose the underlying status surface:
 *
 * - `.data` — Signal of the current value
 * - `.loading` — Signal<boolean> for in-flight loads
 * - `.error` — Signal of the last error (or null)
 *
 * Methods drive the lifecycle:
 *
 * - `.refresh()` — kick off a fresh load (cancels any in-flight load)
 * - `.set(value)` — override the value imperatively
 * - `.update(fn)` — transform the value in place
 * - `.reset()` — clear data/error/loading back to initial state
 */
export interface AsyncSourceSignal<T> {
  (): T | undefined;
  /** Read-only data signal. */
  readonly data: Signal<T | undefined>;
  /** Loading state. */
  readonly loading: Signal<boolean>;
  /** Last error (null when none). */
  readonly error: Signal<unknown | null>;
  /** Trigger a fresh load; cancels any in-flight load via subscription teardown. */
  refresh(): void;
  /** Set the value imperatively (cancels in-flight load). */
  set(value: T): void;
  /** Update the value via transform. */
  update(updater: (current: T | undefined) => T): void;
  /** Reset to initial state — clears data, loading, and error. */
  reset(): void;
}

// =============================================================================
// MARKER FACTORY (self-registering for tree-shaking)
// =============================================================================

let asyncSourceRegistered = false;

/**
 * Creates an `asyncSource` marker — a SignalTree-native async primitive that
 * loads data, exposes loading/error/data signals, and auto-cleans on the
 * surrounding `DestroyRef`.
 *
 * Place anywhere in your tree literal — the marker materializes into a fully
 * functional {@link AsyncSourceSignal} at that path during tree construction.
 *
 * @example Basic auto-loading source
 * ```typescript
 * const store = signalTree({
 *   users: asyncSource<User[]>({
 *     initial: [],
 *     load: () => this.api.list$(),
 *   }),
 * });
 *
 * // Read the data:
 * store.$.users();         // User[] | undefined (current value)
 * store.$.users.data();    // same
 * store.$.users.loading(); // boolean
 * store.$.users.error();   // unknown | null
 *
 * // Drive the lifecycle:
 * store.$.users.refresh(); // reload
 * store.$.users.set([{ id: 1, name: 'Alice' }]); // override
 * store.$.users.reset();
 * ```
 *
 * @example Lazy loading (deferred to explicit `.refresh()`)
 * ```typescript
 * const store = signalTree({
 *   report: asyncSource<Report>({
 *     load: () => this.api.generateReport$(),
 *     lazy: true,
 *   }),
 * });
 *
 * // No automatic load — caller decides when:
 * onGenerateClick() {
 *   this.store.$.report.refresh();
 * }
 * ```
 */
export function asyncSource<T>(
  config: AsyncSourceConfig<T>
): AsyncSourceMarker<T> {
  if (!asyncSourceRegistered) {
    asyncSourceRegistered = true;
    registerBuiltinMarkerProcessor(isAsyncSourceMarker, createAsyncSourceSignal);
  }
  return {
    [ASYNC_SOURCE_MARKER]: true,
    config,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

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

// =============================================================================
// SIGNAL FACTORY (materializer)
// =============================================================================

/**
 * Materializes an {@link AsyncSourceMarker} into a working {@link AsyncSourceSignal}.
 * Called by the tree walker during `signalTree()` construction.
 */
export function createAsyncSourceSignal<T>(
  marker: AsyncSourceMarker<T>
): AsyncSourceSignal<T> {
  const { initial, load, lazy = false } = marker.config;

  const dataSignal: WritableSignal<T | undefined> = signal<T | undefined>(
    initial
  );
  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<unknown | null>(null);

  let currentSub: Subscription | null = null;
  let destroyed = false;

  // Best-effort DestroyRef binding. Falls back gracefully if outside injection.
  let destroyRef: DestroyRef | null = null;
  try {
    destroyRef = inject(DestroyRef, { optional: true }) ?? null;
  } catch {
    destroyRef = null;
  }
  destroyRef?.onDestroy(() => {
    destroyed = true;
    currentSub?.unsubscribe();
    currentSub = null;
  });

  function runLoad(): void {
    if (destroyed) return;
    currentSub?.unsubscribe();
    currentSub = null;
    loadingSignal.set(true);
    errorSignal.set(null);

    let result: Observable<T> | Promise<T>;
    try {
      result = load();
    } catch (err) {
      loadingSignal.set(false);
      errorSignal.set(err);
      return;
    }

    if (isObservable(result)) {
      const obs = destroyRef
        ? (result as Observable<T>).pipe(takeUntilDestroyed(destroyRef))
        : (result as Observable<T>);
      currentSub = obs.subscribe({
        next: (value) => {
          if (destroyed) return;
          dataSignal.set(value);
        },
        error: (err) => {
          if (destroyed) return;
          errorSignal.set(err);
          loadingSignal.set(false);
        },
        complete: () => {
          if (destroyed) return;
          loadingSignal.set(false);
        },
      });
    } else {
      // Promise path
      (result as Promise<T>).then(
        (value) => {
          if (destroyed) return;
          dataSignal.set(value);
          loadingSignal.set(false);
        },
        (err) => {
          if (destroyed) return;
          errorSignal.set(err);
          loadingSignal.set(false);
        }
      );
    }
  }

  if (!lazy) {
    // Defer the auto-load off the synchronous materialization pass. SignalTree
    // finalizes markers lazily on first `.$` access — often a template read
    // during Angular's render — so a synchronous `runLoad()` here would write
    // `loading`/`data` mid-render (NG0600). A microtask lands the writes after
    // the current render.
    queueMicrotask(() => {
      if (!destroyed) runLoad();
    });
  }

  const fn = (() => dataSignal()) as AsyncSourceSignal<T>;
  Object.defineProperty(fn, 'data', { value: dataSignal.asReadonly() });
  Object.defineProperty(fn, 'loading', { value: loadingSignal.asReadonly() });
  Object.defineProperty(fn, 'error', { value: errorSignal.asReadonly() });
  fn.refresh = () => runLoad();
  fn.set = (value: T) => {
    currentSub?.unsubscribe();
    currentSub = null;
    loadingSignal.set(false);
    errorSignal.set(null);
    dataSignal.set(value);
  };
  fn.update = (updater: (current: T | undefined) => T) => {
    dataSignal.update(updater);
  };
  fn.reset = () => {
    currentSub?.unsubscribe();
    currentSub = null;
    loadingSignal.set(false);
    errorSignal.set(null);
    dataSignal.set(initial);
  };

  return fn;
}

// Hold a reference to Injector to silence the unused-import warning in some
// TS configs; reserved for future enhancement (per-tree injection contexts).
void Injector;
