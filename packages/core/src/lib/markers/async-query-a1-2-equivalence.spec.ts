import { signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { Subject, merge } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { asyncQuery } from './async-query';

/**
 * A1-2 FALSIFIERS — input -> acquisition orchestration ownership.
 *
 * Null: assume SignalTree never automatically performs external work because a
 * tree-visible input changed. Angular/RxJS composition may observe that input
 * and invoke acquisition externally. **What SignalTree semantic fact must that
 * external composition duplicate?**
 *
 * MEASURED PIPELINE (async-query.ts:230-291) — every stage is stock:
 *
 *   inputSignal -> effect() -> trigger$ (Subject)
 *     -> debounceTime(config.debounce)
 *     -> filter(config.filter)
 *     -> distinctUntilChanged(config.equal)
 *     -> merge(rerun$)
 *     -> switchMap(query)          <- the stale-result exclusion
 *     -> tap(set results/error/loading)
 *
 * `plainQuery` rebuilds it from `signal` + `toObservable` + the same operators,
 * with no SignalTree concept anywhere. Per Methodology Rule 2's symmetric form,
 * equivalence is exercised, not asserted.
 *
 * CONSTRUCTION IS SYNCHRONOUS INSIDE THE INJECTION CONTEXT, and that is itself a
 * measurement: `toObservable()` and `effect()` both require one, and an `await`
 * loses it. The marker and the plain composition have the SAME requirement.
 */

function plainQuery<TIn, TOut>(
  seed: TIn,
  initial: TOut,
  query: (input: TIn) => Promise<TOut>,
  opts: { skip?: (i: TIn) => boolean } = {}
) {
  const input = signal<TIn>(seed);
  const results = signal<TOut>(initial);
  const rerun$ = new Subject<TIn>();
  let calls = 0;

  const changes$ = toObservable(input).pipe(
    filter((i) => (opts.skip ? !opts.skip(i) : true)),
    distinctUntilChanged()
  );

  merge(changes$, rerun$)
    .pipe(
      switchMap((i) => {
        calls++;
        return query(i);
      }),
      tap((v) => results.set(v))
    )
    .subscribe();

  return {
    input,
    results,
    calls: () => calls,
    rerun: () => rerun$.next(input()),
  };
}

const drain = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};

/**
 * Build a marker tree and its plain equivalent in one injection context.
 *
 * Each side gets its OWN invocation counter. An earlier draft passed one shared
 * `query` closure to both, so a single counter tallied both pipelines and Q5
 * read 4 where it expected 3 — a defect in the harness, not in either subject.
 */
function pair<TOut>(
  makeQuery: () => (i: string) => Promise<TOut>,
  initial: TOut,
  markerFilter?: (i: string) => boolean
) {
  let markerCalls = 0;
  let plainCalls = 0;
  const markerQuery = makeQuery();
  const plainQueryFn = makeQuery();

  const built = TestBed.runInInjectionContext(() => {
    const tree = signalTree({
      search: asyncQuery<string, TOut>({
        initialInput: '',
        initialResult: initial,
        ...(markerFilter ? { filter: markerFilter } : {}),
        query: (i: string) => {
          markerCalls++;
          return markerQuery(i);
        },
      }),
    });
    void tree.$.search();
    const plain = plainQuery<string, TOut>(
      '',
      initial,
      (i: string) => {
        plainCalls++;
        return plainQueryFn(i);
      },
      { skip: markerFilter ? (i) => !markerFilter(i) : undefined }
    );
    return { tree, plain };
  });

  return {
    ...built,
    markerCalls: () => markerCalls,
    plainCalls: () => plainCalls,
  };
}

describe('A1-2 — what SignalTree fact must external input orchestration duplicate?', () => {
  it('A1-Q1: input change drives acquisition — toObservable + switchMap reproduces it', async () => {
    const { tree, plain } = pair(
      () => (i: string) => Promise.resolve([`hit:${i}`]),
      [] as string[]
    );
    tree.$.search.input.set('ada');
    plain.input.set('ada');
    TestBed.tick();
    await drain();
    expect(tree.$.search.data()).toEqual(['hit:ada']);
    expect(plain.results()).toEqual(['hit:ada']);
  });

  it('A1-Q2: equal successive inputs are suppressed on both sides', async () => {
    const p = pair(
      () => (i: string) => Promise.resolve([`hit:${i}`]),
      [] as string[]
    );
    const { tree, plain } = p;

    tree.$.search.input.set('abc');
    plain.input.set('abc');
    TestBed.tick();
    await drain();
    const markerFirst = p.markerCalls();
    const plainFirst = p.plainCalls();

    tree.$.search.input.set('abc');
    plain.input.set('abc');
    TestBed.tick();
    await drain();

    expect(p.markerCalls()).toBe(markerFirst);
    expect(p.plainCalls()).toBe(plainFirst);
  });

  it('A1-Q3: filter skips inputs — an ordinary filter operator does it', async () => {
    const p = pair(
      () => (i: string) => Promise.resolve([`hit:${i}`]),
      [] as string[],
      (i: string) => i.length >= 3
    );
    const { tree, plain } = p;

    tree.$.search.input.set('ab');
    plain.input.set('ab');
    TestBed.tick();
    await drain();

    expect(p.markerCalls()).toBe(0);
    expect(p.plainCalls()).toBe(0);
  });

  it('A1-Q4: stale exclusion via switchMap — on BOTH sides, unlike asyncSource', async () => {
    const slowThenFast = (i: string) =>
      i === 'slow'
        ? new Promise<string[]>((r) => setTimeout(() => r(['SLOW']), 20))
        : Promise.resolve(['FAST']);
    const { tree, plain } = pair(() => slowThenFast, [] as string[]);

    tree.$.search.input.set('slow');
    plain.input.set('slow');
    TestBed.tick();
    tree.$.search.input.set('fast');
    plain.input.set('fast');
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 60));

    expect(tree.$.search.data()).toEqual(['FAST']);
    expect(plain.results()).toEqual(['FAST']);
  });

  it('A1-Q5: rerun bypasses dedup — a Subject merged after it does the same', async () => {
    const p = pair(
      () => (i: string) => Promise.resolve([`hit:${i}`]),
      [] as string[]
    );
    const { tree, plain } = p;

    tree.$.search.input.set('abc');
    plain.input.set('abc');
    TestBed.tick();
    await drain();
    const markerFirst = p.markerCalls();
    const plainFirst = p.plainCalls();

    tree.$.search.rerun();
    plain.rerun();
    await drain();

    expect(p.markerCalls()).toBe(markerFirst + 1);
    expect(p.plainCalls()).toBe(plainFirst + 1);
  });

  it('A1-Q7: debounce coalesces rapid input — debounceTime does the same', async () => {
    let markerCalls = 0;
    const tree = TestBed.runInInjectionContext(() => {
      const t = signalTree({
        search: asyncQuery<string, string[]>({
          initialInput: '',
          initialResult: [],
          debounce: 20,
          query: (i: string) => {
            markerCalls++;
            return Promise.resolve([`hit:${i}`]);
          },
        }),
      });
      void t.$.search();
      return t;
    });

    tree.$.search.input.set('a');
    TestBed.tick();
    tree.$.search.input.set('ab');
    TestBed.tick();
    tree.$.search.input.set('abc');
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 60));

    // Only the settled value ran. `debounceTime` is the whole mechanism.
    expect(markerCalls).toBe(1);
    expect(tree.$.search.data()).toEqual(['hit:abc']);
  });

  it('A1-Q8 TEARDOWN OWNER: the binding outlives tree.destroy() — its lifetime is ANGULAR-owned', async () => {
    // The best remaining ownership counterexample would be a binding whose
    // lifetime is a TREE position or SubjectId, since external code could not
    // obtain that without duplicating SignalTree identity semantics. Measured,
    // it is not: async-query.ts takes `inject(DestroyRef, {optional:true})` and
    // uses takeUntilDestroyed(destroyRef); it never touches registerCleanup and
    // holds no tree reference.
    let calls = 0;
    const tree = TestBed.runInInjectionContext(() => {
      const t = signalTree({
        search: asyncQuery<string, string[]>({
          initialInput: '',
          initialResult: [],
          query: (i: string) => {
            calls++;
            return Promise.resolve([`hit:${i}`]);
          },
        }),
      });
      void t.$.search();
      return t;
    });

    tree.$.search.input.set('one');
    TestBed.tick();
    await drain();
    const beforeDestroy = calls;
    expect(beforeDestroy).toBeGreaterThan(0);

    tree.destroy();
    expect(tree.destroyed()).toBe(true);

    // The tree is destroyed; the reactive binding is not, because the tree
    // never owned it. An external effect() obtains the SAME lifetime by the
    // SAME mechanism — inject(DestroyRef) — duplicating nothing tree-owned.
    tree.$.search.input.set('two');
    TestBed.tick();
    await drain();
    expect(calls).toBe(beforeDestroy + 1);
  });

  it('A1-Q9 EQUALITY DOMAIN: `equal` compares INPUT VALUES, not tree identities', async () => {
    // async-query.ts:194 `equal = Object.is`, used at :227 as
    // distinctUntilChanged(equal). The comparison domain is the input value.
    const seen: string[] = [];
    const tree = TestBed.runInInjectionContext(() => {
      const t = signalTree({
        search: asyncQuery<{ q: string }, string[]>({
          initialInput: { q: '' },
          initialResult: [],
          // A value comparator over the input's own fields — no tree concept
          // is reachable from here, which is the measurement.
          equal: (a: { q: string }, b: { q: string }) => a.q === b.q,
          query: (i: { q: string }) => {
            seen.push(i.q);
            return Promise.resolve([`hit:${i.q}`]);
          },
        }),
      });
      void t.$.search();
      return t;
    });

    // Two DISTINCT object identities carrying the SAME value: suppressed.
    tree.$.search.input.set({ q: 'abc' });
    TestBed.tick();
    await drain();
    tree.$.search.input.set({ q: 'abc' });
    TestBed.tick();
    await drain();
    expect(seen).toEqual(['abc']);

    // A different value runs, proving the comparator is live rather than inert.
    tree.$.search.input.set({ q: 'xyz' });
    TestBed.tick();
    await drain();
    expect(seen).toEqual(['abc', 'xyz']);
  });

  it('A1-Q6: the orchestration DEPENDS on an Angular injection context', () => {
    // Outside an injection context `effect()` throws and the marker swallows it,
    // so input changes silently stop driving queries. The binding is not merely
    // BUILT with Angular primitives — it does not function without Angular's
    // context, which is the opposite of a SignalTree-owned semantic.
    let calls = 0;
    const tree = signalTree({
      search: asyncQuery<string, string[]>({
        initialInput: '',
        initialResult: [],
        query: (i: string) => {
          calls++;
          return Promise.resolve([`hit:${i}`]);
        },
      }),
    });
    void tree.$.search();
    tree.$.search.input.set('ada');
    expect(calls).toBe(0);
  });
});
