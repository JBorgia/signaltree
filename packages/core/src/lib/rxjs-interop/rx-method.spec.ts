import { DestroyRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { describe, expect, it, vi } from 'vitest';

import { rxMethod } from './rx-method';

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

describe('rxMethod', () => {
  it('runs the pipeline once per raw-value call', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: number[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) => input$.pipe(tap((n) => seen.push(n))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method(1);
      method(2);
      method(3);
      expect(seen).toEqual([1, 2, 3]);
      method.destroy();
    });
  });

  it('supports void input variant with no arguments', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const fired: boolean[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<void>(
        (input$) => input$.pipe(tap(() => fired.push(true))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method();
      method();
      expect(fired).toEqual([true, true]);
      method.destroy();
    });
  });

  it('subscribes to an Observable input and forwards every emission', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: number[] = [];
    const source$ = new Subject<number>();
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) => input$.pipe(tap((n) => seen.push(n))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method(source$);
      source$.next(10);
      source$.next(20);
      expect(seen).toEqual([10, 20]);
      method.destroy();
    });
  });

  it('subscribes to a Signal input and forwards every change', async () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: number[] = [];
    const source = signal(0);
    const method = await TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const m = rxMethod<number>(
        (input$) => input$.pipe(tap((n) => seen.push(n))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      m(source);
      return m;
    });
    // toObservable emits via Angular's effect scheduler; poll until flushed.
    await vi.waitFor(() => expect(seen).toContain(0), { timeout: 1000 });
    source.set(7);
    await vi.waitFor(() => expect(seen).toContain(7), { timeout: 1000 });
    source.set(11);
    await vi.waitFor(() => expect(seen).toContain(11), { timeout: 1000 });
    method.destroy();
  });

  it('integrates RxJS operators (switchMap cancels in-flight work)', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: string[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<string>(
        (input$) =>
          input$.pipe(
            switchMap((q) => of(`result:${q}`)),
            tap((r) => seen.push(r))
          ),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method('a');
      method('b');
      method('c');
      expect(seen).toEqual(['result:a', 'result:b', 'result:c']);
      method.destroy();
    });
  });

  it('does not crash when the pipeline errors — caller handles via catchError', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const errors: unknown[] = [];
    const recovered: number[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) =>
          input$.pipe(
            switchMap((n) =>
              throwError(() => new Error(`boom:${n}`)).pipe(
                catchError((err) => {
                  errors.push(err);
                  return of(-1);
                })
              )
            ),
            map((n) => n),
            tap((n) => recovered.push(n))
          ),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method(1);
      method(2);
      expect(errors).toHaveLength(2);
      expect(recovered).toEqual([-1, -1]);
      method.destroy();
    });
  });

  it('tears down on DestroyRef fire', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: number[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) => input$.pipe(tap((n) => seen.push(n))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method(1);
      fakeDestroy.fire();
      method(2);
      expect(seen).toEqual([1]);
    });
  });

  it('manual destroy() is idempotent and prevents further emissions', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const seen: number[] = [];
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) => input$.pipe(tap((n) => seen.push(n))),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method(1);
      method.destroy();
      method.destroy();
      method(2);
      expect(seen).toEqual([1]);
    });
  });

  it('completes the trigger subject on destroy', () => {
    const fakeDestroy = makeFakeDestroyRef();
    const onComplete = vi.fn();
    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(Injector);
      const method = rxMethod<number>(
        (input$) => input$.pipe(tap({ complete: onComplete })),
        { destroyRef: fakeDestroy.ref, injector }
      );
      method.destroy();
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
