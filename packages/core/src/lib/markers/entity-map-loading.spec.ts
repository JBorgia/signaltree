import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { entityMap } from './entity-map';
import {
  type EntityStorageAdapter,
  invalidateTag,
  parseDuration,
  stableStringify,
} from './entity-loader';
import { loader } from './loader';

interface Plant {
  url: string;
  name: string;
}
const P1: Plant = { url: 'a', name: 'Aloe' };
const P2: Plant = { url: 'b', name: 'Basil' };
const P3: Plant = { url: 'c', name: 'Clover' };
const selectId = (p: Plant) => p.url;

interface Cust {
  id: string;
  name: string;
}
type Scope = { region: string };
const WEST: Cust[] = [{ id: 'w1', name: 'West Co' }];
const EAST: Cust[] = [{ id: 'e1', name: 'East Co' }];
const custId = (c: Cust) => c.id;
const ROWS: Record<string, Cust[]> = { west: WEST, east: EAST };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// =============================================================================

describe('parseDuration() / stableStringify()', () => {
  it('parses durations', () => {
    expect(parseDuration(0)).toBe(0);
    expect(parseDuration(1500)).toBe(1500);
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('30m')).toBe(1_800_000);
    expect(parseDuration('2h')).toBe(7_200_000);
  });
  it('throws on an unknown unit in dev', () => {
    expect(() => parseDuration('30x')).toThrow(/invalid staleTime/);
  });
  it('stableStringify is key-order insensitive but array-order sensitive', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify(['a', 'b'])).not.toBe(stableStringify(['b', 'a']));
  });
});

describe('plain entityMap (no load) has no loader surface', () => {
  it('does not attach load/loading when no loader is configured', () => {
    const tree = signalTree({ users: entityMap<Plant>({ selectId }) });
    const u = tree.$.users as unknown as Record<string, unknown>;
    expect(typeof u['load']).toBe('undefined');
    expect(typeof u['loading']).toBe('undefined');
    // CRUD still works
    tree.$.users.addOne(P1);
    expect(tree.$.users.count()).toBe(1);
  });
});

describe('entityMap({ load }) — global cache-aware (single-scope)', () => {
  it('auto-load is deferred off the render pass (NG0600-safe), then populates', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => {
          calls++;
          return of([P1, P2]);
        }),
        selectId,
      }),
    });
    // First `.$` read (template-like) must NOT have fetched synchronously:
    expect(tree.$.plants.all()).toEqual([]);
    expect(tree.$.plants.loading()).toBe(false);
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(tree.$.plants.all()).toEqual([P1, P2]);
    expect(tree.$.plants.loaded()).toBe(true);
  });

  it('does not auto-load when lazy:true', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => {
          calls++;
          return of([P1]);
        }, { lazy: true }),
        selectId,
      }),
    });
    tree.$.plants.all();
    await Promise.resolve();
    expect(calls).toBe(0);
    await tree.$.plants.load();
    expect(calls).toBe(1);
    expect(tree.$.plants.all()).toEqual([P1]);
  });

  it('single-flight: concurrent load()s coalesce into one fetch', async () => {
    let calls = 0;
    const d = deferred<Plant[]>();
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => {
          calls++;
          return d.promise;
        }, { lazy: true }),
        selectId,
      }),
    });
    const p1 = tree.$.plants.load();
    const p2 = tree.$.plants.load();
    expect(calls).toBe(1);
    expect(p1).toBe(p2);
    d.resolve([P1]);
    await Promise.all([p1, p2]);
    expect(tree.$.plants.all()).toEqual([P1]);
  });

  it('surfaces loader errors; load() still resolves', async () => {
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => Promise.reject(new Error('boom')), { lazy: true }),
        selectId,
      }),
    });
    await tree.$.plants.load();
    expect(tree.$.plants.error()).toBeInstanceOf(Error);
    expect(tree.$.plants.loaded()).toBe(false);
  });

  describe('loadOrThrow()', () => {
    it('resolves normally on success, same as load()', async () => {
      const tree = signalTree({
        plants: entityMap<Plant, string>({
          load: loader(() => Promise.resolve([P1]), { lazy: true }),
          selectId,
        }),
      });
      await expect(tree.$.plants.loadOrThrow()).resolves.toBeUndefined();
      expect(tree.$.plants.all()).toEqual([P1]);
      expect(tree.$.plants.error()).toBeNull();
    });

    it('rejects with the loader error instead of only setting .error()', async () => {
      const tree = signalTree({
        plants: entityMap<Plant, string>({
          load: loader(() => Promise.reject(new Error('boom')), { lazy: true }),
          selectId,
        }),
      });
      await expect(tree.$.plants.loadOrThrow()).rejects.toThrow('boom');
      expect(tree.$.plants.error()).toBeInstanceOf(Error);
      expect(tree.$.plants.loaded()).toBe(false);
    });

    it('does not throw a stale error on a guarded no-op call once fresh', async () => {
      let calls = 0;
      const tree = signalTree({
        plants: entityMap<Plant, string>({
          load: loader(() => {
            calls++;
            return Promise.resolve([P1]);
          }, { staleTime: '1h', lazy: true }),
          selectId,
        }),
      });
      await tree.$.plants.loadOrThrow();
      expect(calls).toBe(1);
      // Second call is a guarded no-op (still fresh) — must not throw.
      await expect(tree.$.plants.loadOrThrow()).resolves.toBeUndefined();
      expect(calls).toBe(1);
    });
  });

  describe('staleTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    });
    afterEach(() => vi.useRealTimers());

    it('skips refetch while fresh, refetches once stale; refresh() forces', async () => {
      let calls = 0;
      const tree = signalTree({
        plants: entityMap<Plant, string>({
          load: loader(() => {
            calls++;
            return of([P1]);
          }, { staleTime: '1h', lazy: true }),
          selectId,
        }),
      });
      await tree.$.plants.load();
      expect(calls).toBe(1);
      vi.setSystemTime(30 * 60_000);
      await tree.$.plants.load(); // fresh → no-op
      expect(calls).toBe(1);
      vi.setSystemTime(61 * 60_000);
      await tree.$.plants.load(); // stale → refetch
      expect(calls).toBe(2);
      await tree.$.plants.refresh(); // forced
      expect(calls).toBe(3);
    });

    it('invalidate() marks stale so the next load() refetches', async () => {
      let calls = 0;
      const tree = signalTree({
        plants: entityMap<Plant, string>({
          load: loader(() => {
            calls++;
            return of([P1]);
          }, { staleTime: '1h', lazy: true }),
          selectId,
        }),
      });
      await tree.$.plants.load();
      tree.$.plants.invalidate();
      await tree.$.plants.load();
      expect(calls).toBe(2);
    });
  });

  it('swr:false flips loaded false on invalidate; swr:true keeps it true', async () => {
    const nonSwr = signalTree({
      plants: entityMap<Plant, string>({ load: loader(() => of([P1])), selectId }),
    });
    nonSwr.$.plants.all();
    await Promise.resolve();
    expect(nonSwr.$.plants.loaded()).toBe(true);
    nonSwr.$.plants.invalidate();
    expect(nonSwr.$.plants.loaded()).toBe(false);

    const swr = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => of([P1]), { swr: true }),
        selectId,
      }),
    });
    swr.$.plants.all();
    await Promise.resolve();
    swr.$.plants.invalidate();
    expect(swr.$.plants.loaded()).toBe(true);
  });
});

describe('invalidateTag()', () => {
  it('invalidates only collections carrying the tag; returns the count', async () => {
    let plantCalls = 0;
    let orderCalls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => {
          plantCalls++;
          return of([P1]);
        }, { staleTime: '1h', tags: ['plants', 'catalog'] }),
        selectId,
      }),
      orders: entityMap<Plant, string>({
        load: loader(() => {
          orderCalls++;
          return of([P2]);
        }, { staleTime: '1h', tags: ['orders'] }),
        selectId,
      }),
    });
    tree.$.plants.all();
    tree.$.orders.all();
    await Promise.resolve();
    expect(plantCalls).toBe(1);
    expect(orderCalls).toBe(1);

    expect(invalidateTag(tree, 'plants')).toBe(1);
    await tree.$.plants.load();
    await tree.$.orders.load();
    expect(plantCalls).toBe(2);
    expect(orderCalls).toBe(1);
  });

  it('walks into nested branches to find tagged collections (regression: invalidateTag used to gate on typeof === object, silently skipping NodeAccessor branches)', async () => {
    let plantCalls = 0;
    const tree = signalTree({
      catalog: {
        nursery: {
          plants: entityMap<Plant, string>({
            load: loader(() => {
              plantCalls++;
              return of([P1]);
            }, { staleTime: '1h', tags: ['plants'] }),
            selectId,
          }),
        },
      },
    });
    tree.$.catalog.nursery.plants.all();
    await Promise.resolve();
    expect(plantCalls).toBe(1);

    expect(invalidateTag(tree, 'plants')).toBe(1);
    await tree.$.catalog.nursery.plants.load();
    expect(plantCalls).toBe(2);
  });

  it('returns 0 for an unknown tag', () => {
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => of([P1]), { tags: ['plants'] }),
        selectId,
      }),
    });
    expect(invalidateTag(tree, 'nope')).toBe(0);
  });
});

describe('persist (offline-first)', () => {
  function memoryAdapter(seed?: unknown): EntityStorageAdapter {
    const store = new Map<string, string>();
    if (seed !== undefined) store.set('plants', JSON.stringify(seed));
    return {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
  }

  it('write-through persists after a load; hydrate seeds then revalidates', async () => {
    const adapter = memoryAdapter([P1, P2]);
    const setSpy = vi.spyOn(adapter, 'setItem');
    const d = deferred<Plant[]>();
    let calls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => {
          calls++;
          return d.promise;
        }, { persist: { adapter, key: 'plants', hydrateThenRevalidate: true } }),
        selectId,
      }),
    });
    expect(tree.$.plants.all()).toEqual([]); // deferred
    await Promise.resolve(); // kickoff: seed + start load
    expect(tree.$.plants.all()).toEqual([P1, P2]); // seeded (stale)
    expect(tree.$.plants.loaded()).toBe(false);
    expect(calls).toBe(1);
    d.resolve([P3]);
    await d.promise;
    await Promise.resolve();
    expect(tree.$.plants.all()).toEqual([P3]);
    expect(tree.$.plants.loaded()).toBe(true);
    expect(setSpy).toHaveBeenCalledWith('plants', JSON.stringify([P3]));
  });
});

describe('entityMap({ load }) — scoped (per-params freshness)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  function scopedTree(c: { n: number }) {
    return signalTree({
      customers: entityMap<Cust, string, Scope>({
        load: loader(({ region }) => {
          c.n++;
          return of(ROWS[region]);
        }, { staleTime: '1h' }),
        selectId: custId,
      }),
    });
  }

  it('scoped collections never auto-load (loader declares a param)', async () => {
    const c = { n: 0 };
    const tree = scopedTree(c);
    tree.$.customers.all();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.n).toBe(0);
  });

  it('same scope fresh → no-op; scope change → refetch; params() typed', async () => {
    const c = { n: 0 };
    const tree = scopedTree(c);
    await tree.$.customers.load({ region: 'west' });
    expect(tree.$.customers.all()).toEqual(WEST);
    expect(tree.$.customers.params()).toEqual({ region: 'west' });
    vi.setSystemTime(5 * 60_000);
    await tree.$.customers.load({ region: 'west' }); // fresh → no-op
    expect(c.n).toBe(1);
    await tree.$.customers.load({ region: 'east' }); // scope changed → refetch
    expect(c.n).toBe(2);
    expect(tree.$.customers.all()).toEqual(EAST);
    expect(tree.$.customers.params()).toEqual({ region: 'east' });
  });

  it('default equal compares scope by value (key-order agnostic)', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      items: entityMap<Cust, string, { a: number; b: number }>({
        load: loader((_s) => {
          c.n++;
          return of(WEST);
        }, { staleTime: '1h' }),
        selectId: custId,
      }),
    });
    await tree.$.items.load({ a: 1, b: 2 });
    await tree.$.items.load({ b: 2, a: 1 } as { a: number; b: number });
    expect(c.n).toBe(1);
  });

  it('custom equal comparator', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityMap<Cust, string, { region: string; ts: number }>({
        load: loader(({ region }) => {
          c.n++;
          return of(ROWS[region]);
        }, { equal: (a, b) => a.region === b.region, staleTime: '1h' }),
        selectId: custId,
      }),
    });
    await tree.$.customers.load({ region: 'west', ts: 1 });
    await tree.$.customers.load({ region: 'west', ts: 999 });
    expect(c.n).toBe(1);
  });
});

describe('entityMap({ load }) — scoped supersede / clear / refresh', () => {
  it('a different scope supersedes the in-flight load; stale result never writes', async () => {
    const dW = deferred<Cust[]>();
    const dE = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityMap<Cust, string, Scope>({
        load: loader(({ region }) => (region === 'west' ? dW.promise : dE.promise)),
        selectId: custId,
      }),
    });
    const pW = tree.$.customers.load({ region: 'west' });
    const pE = tree.$.customers.load({ region: 'east' });
    dW.resolve(WEST); // late — ignored
    dE.resolve(EAST);
    await Promise.all([pW, pE]);
    expect(tree.$.customers.params()).toEqual({ region: 'east' });
    expect(tree.$.customers.all()).toEqual(EAST);
  });

  it('clearOnParamsChange:true blanks immediately; default keeps until settled', async () => {
    const mk = (clear: boolean) => {
      const dW = deferred<Cust[]>();
      const dE = deferred<Cust[]>();
      const tree = signalTree({
        customers: entityMap<Cust, string, Scope>({
          load: loader(({ region }) => (region === 'west' ? dW.promise : dE.promise), { clearOnParamsChange: clear }),
          selectId: custId,
        }),
      });
      return { tree, dW, dE };
    };

    const a = mk(true);
    const aW = a.tree.$.customers.load({ region: 'west' });
    a.dW.resolve(WEST);
    await aW;
    const aE = a.tree.$.customers.load({ region: 'east' });
    expect(a.tree.$.customers.all()).toEqual([]); // blanked
    a.dE.resolve(EAST);
    await aE;

    const b = mk(false);
    const bW = b.tree.$.customers.load({ region: 'west' });
    b.dW.resolve(WEST);
    await bW;
    const bE = b.tree.$.customers.load({ region: 'east' });
    expect(b.tree.$.customers.all()).toEqual(WEST); // kept until settled
    b.dE.resolve(EAST);
    await bE;
    expect(b.tree.$.customers.all()).toEqual(EAST);
  });

  it('refresh() reuses the last scope; no-op before first load', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityMap<Cust, string, Scope>({
        load: loader(({ region }) => {
          c.n++;
          return of(ROWS[region]);
        }, { staleTime: '1h' }),
        selectId: custId,
      }),
    });
    await tree.$.customers.refresh(); // no scope yet → no-op
    expect(c.n).toBe(0);
    await tree.$.customers.load({ region: 'east' });
    await tree.$.customers.refresh(); // reuse east, forced
    expect(c.n).toBe(2);
    expect(tree.$.customers.all()).toEqual(EAST);
  });

  it('per-scope persist storage keys + async-adapter hydrate', async () => {
    const store = new Map<string, string>([
      [`cust::${stableStringify({ region: 'west' })}`, JSON.stringify(WEST)],
    ]);
    const adapter: EntityStorageAdapter = {
      getItem: (k) => Promise.resolve(store.get(k) ?? null), // ASYNC
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
    const d = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityMap<Cust, string, Scope>({
        load: loader((_s) => d.promise, { persist: { adapter, key: 'cust', hydrateThenRevalidate: true } }),
        selectId: custId,
      }),
    });
    const p = tree.$.customers.load({ region: 'west' });
    await Promise.resolve();
    await Promise.resolve();
    expect(tree.$.customers.all()).toEqual(WEST); // seeded from async snapshot
    expect(tree.$.customers.loaded()).toBe(false);
    d.resolve(EAST);
    await p;
    expect(tree.$.customers.all()).toEqual(EAST);
    // scoped write-through key:
    expect(store.get(`cust::${stableStringify({ region: 'west' })}`)).toBe(
      JSON.stringify(EAST)
    );
  });
});

describe('persist.maxScopes — persisted-scope GC (scoped collections)', () => {
  const INDEX_KEY = 'cust::__scopes';
  const scopeKey = (region: string) =>
    `cust::${stableStringify({ region })}`;

  function inspectableAdapter() {
    const store = new Map<string, string>();
    const adapter: EntityStorageAdapter = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
    return { store, adapter };
  }

  function gcTree(adapter: EntityStorageAdapter, maxScopes?: number) {
    return signalTree({
      customers: entityMap<Cust, string, Scope>({
        load: loader((_s) => of(WEST), {
          persist: { adapter, key: 'cust', maxScopes },
        }),
        selectId: custId,
      }),
    });
  }

  // The index maintenance is fire-and-forget (adapter ops may be async), so
  // settle its microtask chain after each load before inspecting the store.
  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('cycling through maxScopes+2 scopes keeps exactly maxScopes entries + the index; oldest evicted', async () => {
    const { store, adapter } = inspectableAdapter();
    const tree = gcTree(adapter, 2);
    for (const region of ['r1', 'r2', 'r3', 'r4']) {
      await tree.$.customers.load({ region });
      await flush();
    }
    expect(store.has(scopeKey('r1'))).toBe(false); // evicted
    expect(store.has(scopeKey('r2'))).toBe(false); // evicted
    expect(store.get(scopeKey('r3'))).toBe(JSON.stringify(WEST));
    expect(store.get(scopeKey('r4'))).toBe(JSON.stringify(WEST));
    expect(store.get(INDEX_KEY)).toBe(
      JSON.stringify([scopeKey('r3'), scopeKey('r4')])
    );
    expect(store.size).toBe(3); // maxScopes entries + the index itself
  });

  it('re-touching an old scope moves it to MRU — not evicted next', async () => {
    const { store, adapter } = inspectableAdapter();
    const tree = gcTree(adapter, 2);
    await tree.$.customers.load({ region: 'r1' });
    await flush();
    await tree.$.customers.load({ region: 'r2' });
    await flush();
    // Re-touch r1 (scope change → refetch → write-through → index upsert).
    await tree.$.customers.load({ region: 'r1' });
    await flush();
    expect(store.get(INDEX_KEY)).toBe(
      JSON.stringify([scopeKey('r2'), scopeKey('r1')])
    );
    // r3 must now evict r2 (LRU), not the re-touched r1.
    await tree.$.customers.load({ region: 'r3' });
    await flush();
    expect(store.has(scopeKey('r2'))).toBe(false);
    expect(store.has(scopeKey('r1'))).toBe(true);
    expect(store.get(INDEX_KEY)).toBe(
      JSON.stringify([scopeKey('r1'), scopeKey('r3')])
    );
  });

  it('unset maxScopes: never writes the index key, never removes (current behavior)', async () => {
    const { store, adapter } = inspectableAdapter();
    const removeSpy = vi.spyOn(adapter, 'removeItem');
    const tree = gcTree(adapter, undefined);
    for (const region of ['r1', 'r2', 'r3', 'r4']) {
      await tree.$.customers.load({ region });
      await flush();
    }
    expect(store.has(INDEX_KEY)).toBe(false);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(store.size).toBe(4); // all scope entries kept
  });

  it('eviction removeItem failures are best-effort — the load still resolves', async () => {
    const { store, adapter } = inspectableAdapter();
    adapter.removeItem = () => Promise.reject(new Error('quota'));
    const tree = gcTree(adapter, 1);
    await tree.$.customers.load({ region: 'r1' });
    await flush();
    // r2 triggers an eviction whose removeItem rejects — must not surface.
    await expect(
      tree.$.customers.load({ region: 'r2' })
    ).resolves.toBeUndefined();
    await flush();
    expect(tree.$.customers.all()).toEqual(WEST);
    expect(tree.$.customers.error()).toBeNull();
    // Index still pruned (slot dropped) even though the entry lingers.
    expect(store.get(INDEX_KEY)).toBe(JSON.stringify([scopeKey('r2')]));
  });

  it('synchronously-throwing removeItem is equally best-effort', async () => {
    const { store, adapter } = inspectableAdapter();
    adapter.removeItem = () => {
      throw new Error('nope');
    };
    const tree = gcTree(adapter, 1);
    await tree.$.customers.load({ region: 'r1' });
    await flush();
    await expect(
      tree.$.customers.load({ region: 'r2' })
    ).resolves.toBeUndefined();
    await flush();
    expect(store.get(INDEX_KEY)).toBe(JSON.stringify([scopeKey('r2')]));
  });

  it('fails closed at the loader() call site on a non-positive-integer maxScopes (dev)', () => {
    // Validated in the loader() factory, NOT at attach time: the marker
    // materializer swallows processor throws, so an attach-time throw
    // would not actually fail closed (same reasoning as [ST2004]).
    const { adapter } = inspectableAdapter();
    expect(() => gcTree(adapter, 0)).toThrow(/maxScopes/);
    expect(() => gcTree(adapter, 2.5)).toThrow(/maxScopes/);
  });

  it('global (parameterless) collections ignore maxScopes — single entry, no index', async () => {
    const { store, adapter } = inspectableAdapter();
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => of([P1]), {
          lazy: true,
          persist: { adapter, key: 'plants', maxScopes: 2 },
        }),
        selectId,
      }),
    });
    await tree.$.plants.load();
    await flush();
    expect(store.get('plants')).toBe(JSON.stringify([P1]));
    expect(store.has('plants::__scopes')).toBe(false);
    expect(store.size).toBe(1);
  });
});

describe('loader teardown (materializing injector destroyed)', () => {
  // Pins the RFC 0005 §6 claim that removing the `takeUntilDestroyed` pipe
  // lost nothing: the loader's `DestroyRef.onDestroy` hook unsubscribes the
  // in-flight Observable, and settle callbacks guard `destroyed`.
  it('drops rows emitted after destroy — no write, no throw', () => {
    const subject = new Subject<Plant[]>();
    const env = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector)
    );

    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => subject.asObservable(), { lazy: true }),
        selectId,
      }),
    });

    // Materialize the loading entityMap (and start the load) INSIDE the
    // child injection context so the loader binds its DestroyRef to `env`.
    runInInjectionContext(env, () => {
      void tree.$.plants.load();
    });
    expect(tree.$.plants.loading()).toBe(true);
    expect(subject.observed).toBe(true);

    env.destroy();

    // Destroy unsubscribed the in-flight source…
    expect(subject.observed).toBe(false);
    // …so a late emission neither applies rows nor throws.
    expect(() => subject.next([P1, P2])).not.toThrow();
    expect(tree.$.plants.all()).toEqual([]);
    expect(tree.$.plants.loaded()).toBe(false);
  });

  it('drops rows resolved after destroy (Promise loader) — settle guard', async () => {
    // Promises cannot be unsubscribed, so this pins the `destroyed` guard in
    // settleSuccess — the only line standing between a late resolution and a
    // post-destroy write.
    const d = deferred<Plant[]>();
    const env = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector)
    );

    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => d.promise, { lazy: true }),
        selectId,
      }),
    });

    // Materialize the loading entityMap (and start the load) INSIDE the
    // child injection context so the loader binds its DestroyRef to `env`.
    runInInjectionContext(env, () => {
      void tree.$.plants.load();
    });
    expect(tree.$.plants.loading()).toBe(true);

    env.destroy();

    // Resolve AFTER destroy: rows must not be applied.
    d.resolve([P1, P2]);
    await Promise.resolve();
    await Promise.resolve();
    expect(tree.$.plants.all()).toEqual([]);
    expect(tree.$.plants.loaded()).toBe(false);
  });

  it('settles a caller-held load() promise and clears loading() on destroy (Observable loader)', async () => {
    // RFC 0005 §6 addendum: destroy used to null `inFlightResolve` without
    // invoking it — a caller's `await tree.$.plants.load()` hung forever and
    // `loading()` stuck true. Destroy must resolve (never reject — load()'s
    // contract) and flip loading() false.
    const subject = new Subject<Plant[]>();
    const env = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector)
    );

    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => subject.asObservable(), { lazy: true }),
        selectId,
      }),
    });

    let held!: Promise<void>;
    runInInjectionContext(env, () => {
      held = tree.$.plants.load();
    });
    expect(tree.$.plants.loading()).toBe(true);

    env.destroy();

    await held; // pre-fix: hangs forever (test would time out)
    expect(tree.$.plants.loading()).toBe(false);
    expect(tree.$.plants.loaded()).toBe(false);
  });

  it('settles caller-held load()/loadOrThrow() promises and clears loading() on destroy (Promise loader)', async () => {
    const d = deferred<Plant[]>();
    const env = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector)
    );

    const tree = signalTree({
      plants: entityMap<Plant, string>({
        load: loader(() => d.promise, { lazy: true }),
        selectId,
      }),
    });

    let held!: Promise<void>;
    let heldOrThrow!: Promise<void>;
    runInInjectionContext(env, () => {
      held = tree.$.plants.load();
      heldOrThrow = tree.$.plants.loadOrThrow(); // dedups onto the same flight
    });
    expect(tree.$.plants.loading()).toBe(true);

    env.destroy();

    await held; // pre-fix: hangs forever
    // loadOrThrow resolves too (does not reject): a torn-down scope is not a
    // loader failure — `.error()` stays null, so its post-await check passes.
    await expect(heldOrThrow).resolves.toBeUndefined();
    expect(tree.$.plants.error()).toBeNull();
    expect(tree.$.plants.loading()).toBe(false);

    // A late resolution is still dropped by the `destroyed` settle guard.
    d.resolve([P1, P2]);
    await Promise.resolve();
    await Promise.resolve();
    expect(tree.$.plants.all()).toEqual([]);
    expect(tree.$.plants.loading()).toBe(false);
  });
});

describe('entityMap loading — typing (compile-time)', () => {
  it('enforces load() vs load(params) and gates the loader surface on `load`', () => {
    const scoped = signalTree({
      c: entityMap<Cust, string, Scope>({
        load: loader(({ region }) => of(ROWS[region])),
        selectId: custId,
      }),
    });
    const global = signalTree({
      c: entityMap<Plant, string>({ load: loader(() => of([P1])), selectId }),
    });
    const plain = signalTree({ c: entityMap<Plant, string>({ selectId }) });

    if (false as boolean) {
      // @ts-expect-error scoped load() needs a scope argument
      scoped.$.c.load();
      void scoped.$.c.load({ region: 'west' });
      void global.$.c.load();
      // @ts-expect-error global load() takes no argument
      global.$.c.load({ region: 'west' });
      // @ts-expect-error plain entityMap has no load()
      plain.$.c.load();
    }

    expect(scoped.$.c.params()).toBeUndefined();
    expect(global.$.c.loaded()).toBeDefined();
    // plain still has entityMap surface
    expect(plain.$.c.count()).toBeDefined();
  });
});
