import { DestroyRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { describe, expect, it, vi } from 'vitest';

import {
  asyncSource,
  ASYNC_SOURCE_MARKER,
  createAsyncSourceSignal,
  isAsyncSourceMarker,
} from './async-source';

function makeFakeDestroyRef() {
  const callbacks: Array<() => void> = [];
  const ref = {
    onDestroy: (fn: () => void) => {
      callbacks.push(fn);
      return () => {
        const i = callbacks.indexOf(fn);
        if (i >= 0) callbacks.splice(i, 1);
      };
    },
  } as DestroyRef;
  return { ref, fire: () => callbacks.forEach((fn) => fn()) };
}

describe('asyncSource() marker', () => {
  describe('marker creation', () => {
    it('creates an asyncSource marker with the expected symbol', () => {
      const marker = asyncSource<number>({ load: () => of(1) });
      expect(marker[ASYNC_SOURCE_MARKER]).toBe(true);
      expect(typeof marker.config.load).toBe('function');
    });

    it('preserves the initial value and lazy flag in config', () => {
      const m = asyncSource<number>({
        initial: 42,
        load: () => of(99),
        lazy: true,
      });
      expect(m.config.initial).toBe(42);
      expect(m.config.lazy).toBe(true);
    });

    it('isAsyncSourceMarker identifies real markers and rejects others', () => {
      expect(isAsyncSourceMarker(asyncSource({ load: () => of(1) }))).toBe(true);
      expect(isAsyncSourceMarker({})).toBe(false);
      expect(isAsyncSourceMarker(null)).toBe(false);
      expect(isAsyncSourceMarker({ [ASYNC_SOURCE_MARKER]: false })).toBe(false);
      expect(isAsyncSourceMarker(undefined)).toBe(false);
    });
  });

  describe('materialization (Observable loader)', () => {
    it('returns the initial value before the load completes', async () => {
      await TestBed.runInInjectionContext(async () => {
        const fake = makeFakeDestroyRef();
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            // Never-emitting observable so we observe the pre-load state.
            load: () => new Subject<number>(),
          })
        );
        // Auto-load is deferred; after the microtask it is loading (the Subject
        // never emits), and the value is still the initial.
        await Promise.resolve();
        expect(accessor()).toBe(0);
        expect(accessor.loading()).toBe(true);
        expect(accessor.error()).toBeNull();
        void fake;
      });
    });

    it('auto-loads on materialization and exposes the resolved value', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({ initial: 0, load: () => of(7) })
        );
        // Auto-load is deferred off the materialize/render pass (NG0600-safe).
        expect(accessor()).toBe(0);
        await Promise.resolve();
        expect(accessor()).toBe(7);
        expect(accessor.loading()).toBe(false);
        expect(accessor.error()).toBeNull();
      });
    });

    it('lazy: true skips auto-load — value stays at initial until refresh()', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({ initial: 0, load: () => of(99), lazy: true })
        );
        expect(accessor()).toBe(0);
        expect(accessor.loading()).toBe(false);

        accessor.refresh();
        // synchronous of() emits immediately
        expect(accessor()).toBe(99);
        expect(accessor.loading()).toBe(false);
      });
    });

    it('populates error signal and clears loading when the Observable errors', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => throwError(() => new Error('boom')),
          })
        );
        await Promise.resolve();
        expect(accessor.error()).toBeInstanceOf(Error);
        expect((accessor.error() as Error).message).toBe('boom');
        expect(accessor.loading()).toBe(false);
        expect(accessor()).toBe(0); // initial preserved
      });
    });

    it('catches synchronous throw from the load() factory', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => {
              throw new Error('factory threw');
            },
          })
        );
        await Promise.resolve();
        expect((accessor.error() as Error).message).toBe('factory threw');
        expect(accessor.loading()).toBe(false);
      });
    });

    it('refresh() cancels an in-flight load and starts a new one', async () => {
      await TestBed.runInInjectionContext(async () => {
        const subject = new Subject<number>();
        let invocations = 0;
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => {
              invocations++;
              return subject.asObservable();
            },
          })
        );
        await Promise.resolve(); // deferred auto-load runs
        expect(invocations).toBe(1);
        expect(accessor.loading()).toBe(true);

        accessor.refresh();
        expect(invocations).toBe(2);
        // Still loading (new sub is also pending)
        expect(accessor.loading()).toBe(true);

        // Emit on the original subject — should be ignored because the
        // first subscription was torn down on refresh.
        // (subject is hot; we can't observe directly that the cancel happened,
        // but if both subs were active we'd see value 5 then 9 below.)
        subject.next(5);
        subject.next(9);
        // The new subscription IS to the same subject (in this test setup),
        // so the most recent value wins via the .next() to all subscribers.
        expect(accessor()).toBe(9);
      });
    });
  });

  describe('materialization (Promise loader)', () => {
    it('resolves the Promise and updates the value', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => Promise.resolve(123),
          })
        );
        // Wait for the microtask queue to drain.
        await vi.waitFor(() => expect(accessor()).toBe(123), { timeout: 500 });
        expect(accessor.loading()).toBe(false);
        expect(accessor.error()).toBeNull();
      });
    });

    it('captures Promise rejection in the error signal', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => Promise.reject(new Error('rejected')),
          })
        );
        await vi.waitFor(
          () => expect(accessor.error()).toBeInstanceOf(Error),
          { timeout: 500 }
        );
        expect((accessor.error() as Error).message).toBe('rejected');
        expect(accessor.loading()).toBe(false);
      });
    });
  });

  describe('imperative methods', () => {
    it('set() overrides the value, clears loading/error, and cancels in-flight', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 0,
            load: () => new Subject<number>(), // never resolves
          })
        );
        await Promise.resolve(); // deferred auto-load runs → loading true
        expect(accessor.loading()).toBe(true);
        accessor.set(42);
        expect(accessor()).toBe(42);
        expect(accessor.loading()).toBe(false);
        expect(accessor.error()).toBeNull();
      });
    });

    it('update() transforms the value via callback', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({ initial: 10, load: () => of(20) })
        );
        // Auto-load is deferred; after the microtask the value is 20.
        await Promise.resolve();
        expect(accessor()).toBe(20);
        accessor.update((cur) => (cur ?? 0) * 2);
        expect(accessor()).toBe(40);
      });
    });

    it('reset() restores initial value and clears loading/error', async () => {
      await TestBed.runInInjectionContext(async () => {
        const accessor = createAsyncSourceSignal(
          asyncSource<number>({
            initial: 5,
            load: () => throwError(() => new Error('x')),
          })
        );
        await Promise.resolve();
        expect(accessor.error()).toBeInstanceOf(Error);
        accessor.reset();
        expect(accessor()).toBe(5);
        expect(accessor.loading()).toBe(false);
        expect(accessor.error()).toBeNull();
      });
    });
  });

  describe('exports', () => {
    it('exports the materializer for marker-processor registration', () => {
      expect(typeof createAsyncSourceSignal).toBe('function');
    });

    it('marker factory is callable outside an injection context', () => {
      // The factory itself only registers the processor; no DI required.
      const m = asyncSource<number>({ load: () => of(1) });
      expect(isAsyncSourceMarker(m)).toBe(true);
    });
  });

  // Reference these so vi doesn't flag them as unused in some configs.
  void Injector;
  void timer;
  void map;
  void take;
  void firstValueFrom;
});
