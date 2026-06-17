import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import {
  asyncStream,
  createAsyncStreamSignal,
  isAsyncStreamMarker,
} from './async-stream';

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

describe('createAsyncStreamSignal (standalone factory)', () => {
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
    const stream = createAsyncStreamSignal<number, number>({ initial: 0 });
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
    expect(stream()).toBe('partial');

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

    stream.start(gen(['new']));
    first.next('STALE'); // must be ignored
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('new');
  });

  it('auto-starts; refresh() and its regenerate() alias re-run the stream factory', async () => {
    let runs = 0;
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
      stream: () => gen([`run${++runs}`]),
    });
    await vi.waitFor(() => expect(stream.done()).toBe(true));
    expect(stream()).toBe('run1');

    stream.refresh();
    await vi.waitFor(() => expect(stream()).toBe('run2'));

    // regenerate() is an alias of refresh()
    expect(stream.regenerate).toBe(stream.refresh);
    stream.regenerate();
    await vi.waitFor(() => expect(stream()).toBe('run3'));
  });

  it('refresh() throws without a configured stream factory', () => {
    const stream = createAsyncStreamSignal<string, string>({ initial: '' });
    expect(() => stream.refresh()).toThrow(/stream factory/);
    expect(() => stream.regenerate()).toThrow(/stream factory/);
  });

  it('aborts the AbortSignal passed to the stream factory on cancel() and on supersession', async () => {
    const signals: AbortSignal[] = [];
    const stream = createAsyncStreamSignal<string, string>({
      initial: '',
      accumulate: concat,
      stream: (signal) => {
        signals.push(signal);
        return new Subject<string>(); // never completes
      },
    });
    // auto-started via config.stream
    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);

    // refresh() supersedes → previous run's signal aborts
    stream.refresh();
    expect(signals.length).toBe(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    // cancel() aborts the current run's signal
    stream.cancel();
    expect(signals[1].aborted).toBe(true);
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

describe('asyncStream marker (tree-materialized)', () => {
  it('is recognized by its type guard', () => {
    const marker = asyncStream<string, string>({ initial: '' });
    expect(isAsyncStreamMarker(marker)).toBe(true);
    expect(isAsyncStreamMarker({})).toBe(false);
    expect(isAsyncStreamMarker(null)).toBe(false);
  });

  it('materializes at any tree depth and accumulates through tree.$', async () => {
    const store = signalTree({
      chat: {
        reply: asyncStream<string, string>({
          initial: '',
          accumulate: concat,
        }),
      },
    });

    expect(store.$.chat.reply()).toBe('');
    store.$.chat.reply.start(gen(['Hello', ', ', 'world']));
    expect(store.$.chat.reply.loading()).toBe(true);

    await vi.waitFor(() => expect(store.$.chat.reply.done()).toBe(true));
    expect(store.$.chat.reply()).toBe('Hello, world');
    expect(store.$.chat.reply.error()).toBeNull();
  });

  it('exposes data/loading/error/done as readable signals on the tree node', async () => {
    const store = signalTree({
      reply: asyncStream<string, string>({ initial: '', accumulate: concat }),
    });
    store.$.reply.start(of('a', 'b'));
    await vi.waitFor(() => expect(store.$.reply.done()).toBe(true));
    expect(store.$.reply.data()).toBe('ab');
  });
});
