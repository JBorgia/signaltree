import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createAsyncStreamSignal } from './async-stream';

/** Async generator emitting `chunks`, optional delay, optional throw at the end. */
async function* gen(
  chunks: string[],
  opts: { delayMs?: number; throwAfter?: boolean } = {}
): AsyncGenerator<string> {
  for (const c of chunks) {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    yield c;
  }
  if (opts.throwAfter) throw new Error('stream-boom');
}

/** Minimal ReadableStream of the given chunks. */
function readable(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

const concat = (s: string, c: string) => s + c;

describe('createAsyncStreamSignal (experimental)', () => {
  it('accumulates an AsyncIterable token stream into state', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });
    expect(stream()).toBe('');
    expect(stream.loading()).toBe(false);

    stream.start(gen(['Hel', 'lo, ', 'wor', 'ld']));
    expect(stream.loading()).toBe(true);

    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('Hello, world');
    expect(stream.loading()).toBe(false);
    expect(stream.error()).toBeNull();
  });

  it('consumes a ReadableStream', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });
    stream.start(readable(['a', 'b', 'c']));
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('abc');
  });

  it('consumes an Observable', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });
    stream.start(of('x', 'y', 'z'));
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('xyz');
  });

  it('consumes a Promise (single chunk)', async () => {
    const stream = createAsyncStreamSignal<number, number>({
      initial: 0,
    });
    stream.start(Promise.resolve(42));
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe(42);
  });

  it('surfaces a stream error WITHOUT throwing, and recovers on the next start()', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });

    stream.start(gen(['par', 'tial'], { throwAfter: true }));
    await vi.waitFor(() => expect(stream.error()).toBeInstanceOf(Error));
    expect(stream.loading()).toBe(false);
    // Partial accumulation before the error is retained.
    expect(stream()).toBe('partial');

    // Pipeline is not dead — a fresh stream recovers and clears the error.
    stream.start(gen(['ok']));
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream.error()).toBeNull();
    expect(stream()).toBe('ok');
  });

  it('cancel() aborts the in-flight stream and ignores late chunks', async () => {
    const subject = new Subject<string>();
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });

    stream.start(subject);
    subject.next('a');
    expect(stream()).toBe('a');

    stream.cancel();
    expect(stream.loading()).toBe(false);

    // Emissions after cancel are dropped (superseded run).
    subject.next('b');
    expect(stream()).toBe('a');
  });

  it('start() supersedes an in-flight stream (switchMap-style)', async () => {
    const first = new Subject<string>();
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });

    stream.start(first);
    first.next('old');
    expect(stream()).toBe('old');

    // New stream resets accumulation and ignores the stale subject.
    stream.start(gen(['new']));
    first.next('STALE'); // must be ignored
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('new');
  });

  it('auto-starts when a config.stream factory is provided', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
      stream: () => gen(['auto']),
    });
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('auto');
  });

  it('reset() restores initial state and clears flags', async () => {
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
    });
    stream.start(of('hello'));
    await vi.waitFor(() => expect(stream.done()).toBe(true));

    stream.reset();
    expect(stream()).toBe('');
    expect(stream.done()).toBe(false);
    expect(stream.error()).toBeNull();
    expect(stream.loading()).toBe(false);
  });
});
