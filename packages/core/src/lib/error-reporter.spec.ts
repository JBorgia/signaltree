import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearTreeErrorListenersForTesting,
  onTreeError,
  reportTreeError,
  type TreeErrorEvent,
} from './internals/error-reporter';

/**
 * `onTreeError` — one place to observe every error the library catches.
 *
 * A capability audit against NGXS found `NgxsUnhandledErrorHandler` and nothing
 * equivalent anywhere else, ours included. Each marker caught its own errors and
 * turned them into local error state, which is correct and which also made them
 * invisible to anything wanting to see all of them: reporting to Sentry meant
 * wiring a per-marker `onError` at every call site, forever.
 *
 * The load-bearing property is that this is ADDITIVE. It must not be able to
 * change how any error is handled, and a listener that throws must not damage
 * the operation that reported to it — otherwise adding error *reporting* becomes
 * a source of errors, surfacing at whichever marker happened to report first.
 */
describe('onTreeError', () => {
  beforeEach(() => clearTreeErrorListenersForTesting());
  afterEach(() => clearTreeErrorListenersForTesting());

  it('delivers the event to a listener', () => {
    const seen: TreeErrorEvent[] = [];
    onTreeError((e) => seen.push(e));

    reportTreeError({ error: new Error('x'), source: 'stored', operation: 'write', path: 'k' });

    expect(seen).toHaveLength(1);
    expect(seen[0].source).toBe('stored');
    expect(seen[0].operation).toBe('write');
    expect(seen[0].path).toBe('k');
  });

  it('delivers to every listener', () => {
    let a = 0;
    let b = 0;
    onTreeError(() => a++);
    onTreeError(() => b++);

    reportTreeError({ error: 'e', source: 'async-source', operation: 'load' });

    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('unsubscribes', () => {
    let count = 0;
    const off = onTreeError(() => count++);
    reportTreeError({ error: 'e', source: 'stored', operation: 'read' });
    off();
    reportTreeError({ error: 'e', source: 'stored', operation: 'read' });

    expect(count).toBe(1);
  });

  it('with no listeners it is a no-op, not a throw', () => {
    expect(() =>
      reportTreeError({ error: 'e', source: 'effect', operation: 'run' })
    ).not.toThrow();
  });

  describe('a listener that throws cannot damage anything', () => {
    it('reportTreeError still returns normally', () => {
      onTreeError(() => {
        throw new Error('listener blew up');
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect(() =>
        reportTreeError({ error: 'original', source: 'stored', operation: 'write' })
      ).not.toThrow();

      spy.mockRestore();
    });

    it('the OTHER listeners still receive the event', () => {
      // Order matters: a throwing listener registered first must not prevent
      // the reporting integration registered after it from seeing anything.
      const seen: TreeErrorEvent[] = [];
      onTreeError(() => {
        throw new Error('blew up');
      });
      onTreeError((e) => seen.push(e));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      reportTreeError({ error: 'original', source: 'stored', operation: 'write' });

      expect(seen).toHaveLength(1);
      spy.mockRestore();
    });

    it('reports the listener failure under ST2025, distinctly from the original', () => {
      onTreeError(() => {
        throw new Error('blew up');
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      reportTreeError({ error: 'original', source: 'stored', operation: 'write' });

      expect(spy.mock.calls.flat().join(' ')).toContain('ST2025');
      spy.mockRestore();
    });
  });
});

describe('the stored() marker reports through it', () => {
  beforeEach(() => clearTreeErrorListenersForTesting());
  afterEach(() => clearTreeErrorListenersForTesting());

  it('a failing write is observable globally, with no local onError wired', async () => {
    const { createStoredSignal, flushAllStoredSignals, STORED_MARKER } =
      await import('./markers/stored');
    const seen: TreeErrorEvent[] = [];
    onTreeError((e) => seen.push(e));

    const throwing: Storage = {
      length: 0,
      clear: () => undefined,
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const sig = createStoredSignal({
      [STORED_MARKER]: true,
      key: 'err-spec',
      defaultValue: 0,
      options: { storage: throwing, debounceMs: 0 },
    });
    sig.set(1);
    // Forced rather than slept on: the write is debounced, and a test that
    // waits "long enough" is a flake waiting to happen.
    flushAllStoredSignals();
    await new Promise((r) => queueMicrotask(r));

    const warned = warn.mock.calls.length;
    warn.mockRestore();

    // Asserted FIRST: if the write never failed, nothing below means anything,
    // and a bare "expected false to be true" would send the reader looking in
    // entirely the wrong place. It did exactly that while this test was wrong.
    expect(warned, 'the storage write should have failed and warned').toBeGreaterThan(0);
    expect(seen.map((e) => e.source)).toContain('stored');
    expect(seen.find((e) => e.source === 'stored')?.operation).toBe('write');
  });
});
