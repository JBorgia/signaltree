/**
 * EXPERIMENTAL SPIKE — not exported from the public barrel, excluded from the
 * lib build (see tsconfig.lib.json). Proves the fit of a streaming primitive
 * for AI-embedded apps. Do not depend on this from shipped code.
 *
 * Why this exists: SignalTree's async markers (asyncSource/asyncQuery) take an
 * `Observable | Promise`, but the 2026 AI stack (Vercel AI SDK, OpenAI/Anthropic
 * SDKs) emits `ReadableStream` / `AsyncIterable` of token deltas. And SignalTree
 * leaves default to deepEqual, which is an O(n) footgun on a growing token
 * string. This primitive:
 *   - consumes AsyncIterable | ReadableStream | Observable | Promise uniformly,
 *   - ACCUMULATES chunks into state via a reducer (e.g. token concat),
 *   - uses Object.is equality by default (no deepEqual on every token),
 *   - cancels the in-flight stream on a new start()/cancel()/DestroyRef,
 *   - survives errors: a failed stream sets error() and a fresh start() recovers.
 *
 * Promotion path: mirror async-source.ts to wrap this as an `asyncStream()`
 * marker (registerBuiltinMarkerProcessor + a materializer) so it can attach at
 * any tree path like the other markers.
 */
import {
  DestroyRef,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { isObservable, type Observable, type Subscription } from 'rxjs';

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
  /** Optional source factory; if provided, the stream auto-starts on creation. */
  stream?: () => StreamSource<TChunk>;
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
  /** Abort the in-flight stream; keeps the accumulated value. */
  cancel(): void;
  /** Abort and restore initial value/loading/error/done. */
  reset(): void;
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

export function createAsyncStreamSignal<TChunk, TState>(
  config: AsyncStreamConfig<TChunk, TState>
): AsyncStreamSignal<TChunk, TState> {
  const {
    initial,
    accumulate = (_state: TState, chunk: TChunk) =>
      chunk as unknown as TState,
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

  function begin(source: StreamSource<TChunk>): void {
    stop();
    const myRun = ++runId;
    const live = () => myRun === runId;

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

    if (isObservable(source)) {
      const sub: Subscription = source.subscribe({
        next: onChunk,
        error: onError,
        complete: onDone,
      });
      teardown = () => sub.unsubscribe();
      return;
    }

    if (isReadableStream(source)) {
      const reader = source.getReader();
      teardown = () => void reader.cancel().catch(() => undefined);
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
      // Cooperative cancellation: the loop checks live() each iteration.
      teardown = () => undefined;
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
    teardown = () => undefined;
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
    const s = source ?? stream?.();
    if (s == null) {
      throw new Error(
        'createAsyncStreamSignal: start() needs a source argument or a config.stream factory'
      );
    }
    begin(s);
  };
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
