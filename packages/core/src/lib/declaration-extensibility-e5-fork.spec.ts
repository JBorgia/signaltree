import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { transactions } from '../enhancers/transactions/transactions';

/**
 * M1+M2-E5 — THE EQUIVALENCE FORK.
 *
 * Asking only "are preserved signals second-class?" is too weak: a second-class
 * result does NOT rescue compiler extensibility. So both candidate paths are run
 * against the SAME kernel properties.
 *
 *   PATH A  a prebuilt Angular signal preserved by the tree
 *   PATH B  ORDINARY canonical state, with the library API composed AROUND the
 *           tree's own accessor
 *
 * If B satisfies the properties even where A fails, then third-party compiler
 * extensibility has no survival evidence — the library abstraction is
 * obtainable without extending the declaration language at all.
 *
 * Rule 0n: 14.x's marker protocol is historical evidence only. Nothing here
 * tests "do custom markers work".
 */

/* PATH A — the shape the E0 probe used. */
interface CounterA extends WritableSignal<number> {
  increment(): void;
  doubled: Signal<number>;
}
function makeCounterSignal(initial: number): CounterA {
  const s = signal(initial) as CounterA;
  s.increment = () => s.update((v) => v + 1);
  s.doubled = computed(() => s() * 2);
  return s;
}

/* PATH B — library API composed around an ORDINARY canonical accessor. */
function makeCounterApi(accessor: { (): number; set(v: number): void }) {
  return {
    read: () => accessor(),
    increment: () => accessor.set(accessor() + 1),
    doubled: computed(() => accessor() * 2),
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('E5 fork — canonical participation of the two candidate paths', () => {
  it('PATH A: a preserved Angular signal is NOT captured by undo', async () => {
    const tree = signalTree({ counter: makeCounterSignal(10) }).with(
      timeTravel()
    );
    (tree.$.counter as CounterA).increment();
    await flush();
    expect(tree.$.counter()).toBe(11);

    tree.undo();
    await flush();

    // MEASURED: the write never became authored history, so undo cannot restore
    // it. The value is reachable through the facade but is not canonical truth.
    expect(tree.$.counter()).toBe(11);
  });

  it('PATH B: ordinary canonical state IS captured by undo', async () => {
    const tree = signalTree({ counter: 10 }).with(timeTravel());
    const api = makeCounterApi(tree.$.counter);

    api.increment();
    await flush();
    expect(api.read()).toBe(11);

    tree.undo();
    await flush();

    expect(api.read()).toBe(10);
  });

  it('PATH B: the library API composes derived values over canonical truth', () => {
    const tree = signalTree({ counter: 4 });
    const api = makeCounterApi(tree.$.counter);
    expect(api.doubled()).toBe(8);
    api.increment();
    expect(api.doubled()).toBe(10);
  });

  it('PATH B: writes roll back through the generic transaction kernel', () => {
    const tree = signalTree({ counter: 10 }).with(transactions());
    const api = makeCounterApi(tree.$.counter);

    const pending = tree.transaction(() => {
      api.increment();
      api.increment();
    });
    expect(api.read()).toBe(12);

    pending.rollback();
    expect(api.read()).toBe(10);
  });

  it('PATH B: the value is ordinary canonical truth in the snapshot', () => {
    const tree = signalTree({ counter: 7, other: 'x' });
    const api = makeCounterApi(tree.$.counter);
    api.increment();
    expect(tree()).toEqual({ counter: 8, other: 'x' });
  });
});
