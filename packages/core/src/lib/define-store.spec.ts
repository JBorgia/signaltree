import { inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { defineStore } from './define-store';
import { signalTree } from './signal-tree';

describe('defineStore()', () => {
  it('injects the real tree — callable, with $ and full API', () => {
    const CounterStore = defineStore(() => signalTree({ count: 0, user: { name: 'a' } }));

    TestBed.configureTestingModule({ providers: [CounterStore] });
    const store = TestBed.inject(CounterStore);

    // Reads via $
    expect(store.$.count()).toBe(0);
    expect(store.$.user.name()).toBe('a');

    // Per-leaf writes
    store.$.count.set(5);
    store.$.user.name.set('b');
    expect(store.$.count()).toBe(5);
    expect(store.$.user.name()).toBe('b');

    // Callable snapshot is preserved (constructor returned the tree itself)
    expect(store()).toEqual({ count: 5, user: { name: 'b' } });
  });

  it('runs the factory in an injection context (inject() works inside it)', () => {
    const SEED = new InjectionToken<number>('SEED', { factory: () => 42 });
    const SeededStore = defineStore(() => signalTree({ value: inject(SEED) }));

    TestBed.configureTestingModule({ providers: [SeededStore] });
    const store = TestBed.inject(SeededStore);

    expect(store.$.value()).toBe(42);
  });

  it('ties tree.destroy() to the injector lifecycle (DestroyRef)', () => {
    const DisposableStore = defineStore(() => signalTree({ n: 1 }));

    TestBed.configureTestingModule({ providers: [DisposableStore] });
    const store = TestBed.inject(DisposableStore);
    expect(store.destroyed()).toBe(false);

    // Destroying the providing injector fires DestroyRef.onDestroy → tree.destroy()
    TestBed.resetTestingModule();
    expect(store.destroyed()).toBe(true);
  });

  it('supports providedIn: "root" as an app-wide singleton', () => {
    const RootStore = defineStore(() => signalTree({ ready: true }), {
      providedIn: 'root',
    });

    TestBed.configureTestingModule({});
    const a = TestBed.inject(RootStore);
    const b = TestBed.inject(RootStore);

    expect(a).toBe(b); // singleton
    expect(a.$.ready()).toBe(true);
  });

  it('preserves enhancer-added methods through .with() in the factory', () => {
    // A trivial enhancer that tags the tree with a method.
    const tagged = <T extends object>(tree: T): T & { tag(): string } =>
      Object.assign(tree, { tag: () => 'tagged' });

    const TaggedStore = defineStore(() => signalTree({ x: 1 }).with(tagged));

    TestBed.configureTestingModule({ providers: [TaggedStore] });
    const store = TestBed.inject(TaggedStore);

    expect(store.tag()).toBe('tagged');
    expect(store.$.x()).toBe(1);
  });
});
