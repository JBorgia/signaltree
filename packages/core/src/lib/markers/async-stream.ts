/**
 * `asyncStream` marker — streaming state for AI-embedded apps (chat / LLM token
 * output) and any chunked source.
 *
 * Unlike `asyncSource` / `asyncQuery` (which REPLACE the value on each emission),
 * `asyncStream` ACCUMULATES chunks into state via a reducer — the shape you want
 * for token-by-token LLM output. It consumes the four transports the modern AI
 * stack emits (`AsyncIterable` | `ReadableStream` | `Observable` | `Promise`),
 * uses `Object.is` equality by default (NOT deepEqual — that would be O(n) per
 * token on a growing string), cancels the in-flight stream switchMap-style on a
 * new `start()`/`regenerate()`/`cancel()`/`DestroyRef`, and survives errors (a
 * failed stream sets `error()`; the next `start()` recovers).
 *
 * @example Accumulate an LLM token stream into reactive state
 * ```typescript
 * const store = signalTree({
 *   reply: asyncStream<string, string>({ initial: '', accumulate: (s, c) => s + c }),
 * });
 *
 * // Anthropic / OpenAI hand you an AsyncIterable or ReadableStream:
 * store.$.reply.start(anthropic.messages.stream({ ... }));
 * store.$.reply();          // accumulated text, updates per token
 * store.$.reply.loading();  // streaming in flight
 * store.$.reply.done();     // completed
 * store.$.reply.cancel();   // abort (late chunks dropped)
 * ```
 */
import {
  DestroyRef,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { isObservable, type Observable, type Subscription } from 'rxjs';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

// =============================================================================
// SYMBOL
// =============================================================================

export const ASYNC_STREAM_MARKER = Symbol('ASYNC_STREAM_MARKER');

// =============================================================================
// TYPES
// =============================================================================

export type StreamSource<TChunk> =
  | AsyncIterable<TChunk>
  | ReadableStream<TChunk>
  | Observable<TChunk>
  | Promise<TChunk>;

export interface AsyncStreamConfig<TChunk, TState> {
  /** Starting state, also restored on reset() and at the start of each stream. */
  initial: TState;
  /**
   * Fold each streamed chunk into accumulated state. Default REPLACES state with
   * the chunk. For token streaming pass `(s, c) => s + c`. MUST return a new
   * reference for the change to be observed (Object.is equality).
   */
  accumulate?: (state: TState, chunk: TChunk) => TState;
  /** Equality for the value signal. Default Object.is — intentionally NOT deepEqual. */
  equal?: (a: TState, b: TState) => boolean;
  /**
   * Optional source factory; if provided, the stream auto-starts on
   * materialization and `refresh()`/`regenerate()` re-invoke it. Receives an
   * `AbortSignal` that fires on `cancel()`, supersession (a new start/refresh),
   * `reset()`, and `DestroyRef` teardown — wire it into your `fetch`/SDK call
   * so cancellation actually aborts the upstream request (stops token billing),
   * e.g. `stream: (signal) => fetch(url, { signal })`.
   */
  stream?: (signal: AbortSignal) => StreamSource<TChunk>;
}

export interface AsyncStreamSignal<TChunk, TState> {
  /** Current accumulated value. */
  (): TState;
  readonly data: Signal<TState>;
  /** True while a stream is in flight (before complete/error). */
  readonly loading: Signal<boolean>;
  readonly error: Signal<unknown | null>;
  /** True once the current stream completed without error. */
  readonly done: Signal<boolean>;
  /** Begin (or replace) the stream. Cancels any in-flight stream first. */
  start(source?: StreamSource<TChunk>): void;
  /**
   * Re-run the configured `stream` factory from scratch. Family-consistent with
   * `asyncSource.refresh()`. `regenerate()` is a kept alias (AI vocabulary).
   */
  refresh(): void;
  /** Alias of {@link refresh} — re-run the configured `stream` factory. */
  regenerate(): void;
  /** Abort the in-flight stream; keeps the accumulated value. */
  cancel(): void;
  /** Abort and restore initial value/loading/error/done. */
  reset(): void;
}

/** Marker placeholder, materialized into an {@link AsyncStreamSignal} during tree construction. */
export interface AsyncStreamMarker<TChunk, TState> {
  [ASYNC_STREAM_MARKER]: true;
  config: AsyncStreamConfig<TChunk, TState>;
  /** Phantom types for inference. */
  readonly __chunkType?: TChunk;
  readonly __stateType?: TState;
}

// =============================================================================
// MARKER FACTORY
// =============================================================================

let asyncStreamRegistered = false;

/**
 * Create an `asyncStream` marker. Place it at any depth in a `signalTree()`
 * state literal; the walker materializes it into an {@link AsyncStreamSignal}.
 */
export function asyncStream<TChunk, TState = TChunk>(
  config: AsyncStreamConfig<TChunk, TState>
): AsyncStreamMarker<TChunk, TState> {
  // Self-register on first use (tree-shakeable). Built-in path: suppresses the
  // post-construction timing warning (correct-by-construction inside the literal).
  if (!asyncStreamRegistered) {
    asyncStreamRegistered = true;
    registerBuiltinMarkerProcessor(isAsyncStreamMarker, createAsyncStreamMarker);
  }
  return { [ASYNC_STREAM_MARKER]: true, config };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

export function isAsyncStreamMarker(
  value: unknown
): value is AsyncStreamMarker<unknown, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    ASYNC_STREAM_MARKER in value &&
    (value as Record<symbol, unknown>)[ASYNC_STREAM_MARKER] === true
  );
}

// =============================================================================
// MATERIALIZER
// =============================================================================

/** Materializes an {@link AsyncStreamMarker} (called by the tree walker). */
export function createAsyncStreamMarker<TChunk, TState>(
  marker: AsyncStreamMarker<TChunk, TState>
): AsyncStreamSignal<TChunk, TState> {
  return createAsyncStreamSignal(marker.config);
}

function isReadableStream(x: unknown): x is ReadableStream<unknown> {
  return (
    (typeof ReadableStream !== 'undefined' && x instanceof ReadableStream) ||
    typeof (x as { getReader?: unknown } | null)?.getReader === 'function'
  );
}

function isAsyncIterable(x: unknown): x is AsyncIterable<unknown> {
  return (
    typeof (x as { [Symbol.asyncIterator]?: unknown } | null)?.[
      Symbol.asyncIterator
    ] === 'function'
  );
}

/**
 * Standalone factory — builds an {@link AsyncStreamSignal} without a tree.
 * Use the {@link asyncStream} marker for tree-attached state; use this directly
 * for component-local streaming state.
 */
export function createAsyncStreamSignal<TChunk, TState>(
  config: AsyncStreamConfig<TChunk, TState>
): AsyncStreamSignal<TChunk, TState> {
  const {
    initial,
    accumulate = (_state: TState, chunk: TChunk) => chunk as unknown as TState,
    equal = Object.is,
    stream,
  } = config;

  const dataSignal: WritableSignal<TState> = signal<TState>(initial, { equal });
  const loadingSignal = signal(false);
  const errorSignal = signal<unknown | null>(null);
  const doneSignal = signal(false);

  // Monotonic run id isolates streams the way switchMap does: a chunk from a
  // superseded stream is ignored even if it resolves late.
  let runId = 0;
  let teardown: (() => void) | null = null;

  const stop = () => {
    teardown?.();
    teardown = null;
  };

  function begin(makeSource: (signal: AbortSignal) => StreamSource<TChunk>): void {
    // Invalidate any in-flight run BEFORE tearing it down, so a late chunk from
    // the superseded run can never apply even if teardown throws.
    const myRun = ++runId;
    stop();
    const live = () => myRun === runId;

    // Per-run AbortController. Every teardown aborts it, so a factory that wired
    // `signal` into fetch/an SDK cancels the UPSTREAM request on
    // cancel()/supersession/reset()/destroy — not just the local state updates.
    const ac = new AbortController();
    const setTeardown = (specific: () => void) => {
      teardown = () => {
        ac.abort();
        specific();
      };
    };

    loadingSignal.set(true);
    errorSignal.set(null);
    doneSignal.set(false);
    dataSignal.set(initial);

    const onChunk = (chunk: TChunk) => {
      if (!live()) return;
      dataSignal.set(accumulate(dataSignal(), chunk));
    };
    const onError = (err: unknown) => {
      if (!live()) return;
      errorSignal.set(err);
      loadingSignal.set(false);
    };
    const onDone = () => {
      if (!live()) return;
      loadingSignal.set(false);
      doneSignal.set(true);
    };

    const source = makeSource(ac.signal);

    if (isObservable(source)) {
      const sub: Subscription = source.subscribe({
        next: onChunk,
        error: onError,
        complete: onDone,
      });
      setTeardown(() => sub.unsubscribe());
      return;
    }

    if (isReadableStream(source)) {
      const reader = source.getReader();
      setTeardown(() => void reader.cancel().catch(() => undefined));
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (!live()) return;
            if (done) return onDone();
            onChunk(value as TChunk);
          }
        } catch (err) {
          onError(err);
        }
      })();
      return;
    }

    if (isAsyncIterable(source)) {
      // Cancellation: aborting `ac` signals a factory-wired source to stop;
      // the loop also checks live() each iteration. A raw AsyncIterable passed
      // directly to start() (not via the factory) can't be force-aborted —
      // prefer the `stream` factory form for cancellable async-iterable sources.
      setTeardown(() => undefined);
      void (async () => {
        try {
          for await (const chunk of source) {
            if (!live()) return;
            onChunk(chunk);
          }
          onDone();
        } catch (err) {
          onError(err);
        }
      })();
      return;
    }

    // Promise / thenable.
    setTeardown(() => undefined);
    Promise.resolve(source as Promise<TChunk>).then(
      (v) => {
        onChunk(v);
        onDone();
      },
      (err) => onError(err)
    );
  }

  // Best-effort auto-cleanup on the surrounding DestroyRef (component/service).
  try {
    inject(DestroyRef, { optional: true })?.onDestroy(() => stop());
  } catch {
    // Created outside an injection context — caller owns cancel().
  }

  const fn = (() => dataSignal()) as AsyncStreamSignal<TChunk, TState>;
  Object.defineProperty(fn, 'data', { value: dataSignal.asReadonly() });
  Object.defineProperty(fn, 'loading', { value: loadingSignal.asReadonly() });
  Object.defineProperty(fn, 'error', { value: errorSignal.asReadonly() });
  Object.defineProperty(fn, 'done', { value: doneSignal.asReadonly() });

  fn.start = (source?: StreamSource<TChunk>) => {
    if (source !== undefined) {
      // Pre-made source — can't thread our AbortSignal into it.
      begin(() => source);
      return;
    }
    if (!stream) {
      throw new Error(
        'asyncStream: start() needs a source argument or a config.stream factory'
      );
    }
    begin(stream);
  };
  fn.refresh = () => {
    if (!stream) {
      throw new Error(
        'asyncStream: refresh()/regenerate() requires a config.stream factory'
      );
    }
    begin(stream);
  };
  // Alias — re-run the stream factory under the AI-vocabulary name.
  fn.regenerate = fn.refresh;
  fn.cancel = () => {
    stop();
    loadingSignal.set(false);
  };
  fn.reset = () => {
    stop();
    dataSignal.set(initial);
    loadingSignal.set(false);
    errorSignal.set(null);
    doneSignal.set(false);
  };

  if (stream) fn.start();

  return fn;
}
