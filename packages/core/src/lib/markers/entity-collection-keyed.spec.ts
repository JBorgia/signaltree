import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import {
  entityCollection,
  type EntityCollectionStorageAdapter,
  invalidateTag,
  stableStringify,
} from './entity-collection';

interface Cust {
  id: string;
  name: string;
}
type Scope = { region: string };

const WEST: Cust[] = [{ id: 'w1', name: 'West Co' }];
const EAST: Cust[] = [{ id: 'e1', name: 'East Co' }];
const selectId = (c: Cust) => c.id;
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

describe('stableStringify()', () => {
  it('is insensitive to object key insertion order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify([{ x: 1, y: 2 }])).toBe(
      stableStringify([{ y: 2, x: 1 }])
    );
  });
  it('is sensitive to array order (queryKey semantics)', () => {
    expect(stableStringify(['a', 'b'])).not.toBe(stableStringify(['b', 'a']));
  });
});

describe('keyed entityCollection — freshness per scope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  function makeTree(counter: { n: number }) {
    return signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => {
          counter.n++;
          return of(ROWS[region]);
        },
        key: ({ region }) => [region],
        selectId,
        staleTime: '1h',
      }),
    });
  }

  it('same key + fresh → no refetch; same key + stale → refetch', async () => {
    const c = { n: 0 };
    const tree = makeTree(c);
    await tree.$.customers.load({ region: 'west' });
    expect(c.n).toBe(1);
    // fresh within the hour → no-op
    vi.setSystemTime(30 * 60_000);
    await tree.$.customers.load({ region: 'west' });
    expect(c.n).toBe(1);
    // past the window → refetch
    vi.setSystemTime(61 * 60_000);
    await tree.$.customers.load({ region: 'west' });
    expect(c.n).toBe(2);
  });

  it('key change → refetch, entities replaced, currentKey updates', async () => {
    const c = { n: 0 };
    const tree = makeTree(c);
    await tree.$.customers.load({ region: 'west' });
    expect(tree.$.customers.all()).toEqual(WEST);
    expect(tree.$.customers.currentKey()).toBe(stableStringify(['west']));

    // still fresh for 'west', but a NEW key must refetch:
    await tree.$.customers.load({ region: 'east' });
    expect(c.n).toBe(2);
    expect(tree.$.customers.all()).toEqual(EAST);
    expect(tree.$.customers.currentKey()).toBe(stableStringify(['east']));
  });

  it('key is insensitive to param object key order (coalesces as same scope)', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      items: entityCollection<Cust, string, { a: number; b: number }>({
        load: () => {
          c.n++;
          return of(WEST);
        },
        key: (p) => [p.a, p.b],
        selectId,
        staleTime: '1h',
      }),
    });
    await tree.$.items.load({ a: 1, b: 2 });
    await tree.$.items.load({ b: 2, a: 1 } as { a: number; b: number });
    expect(c.n).toBe(1); // same scope → fresh → no second fetch
  });
});

describe('keyed entityCollection — single-flight & supersede', () => {
  it('concurrent same-key load()s coalesce into one fetch', async () => {
    const c = { n: 0 };
    const d = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: () => {
          c.n++;
          return d.promise;
        },
        key: ({ region }) => [region],
        selectId,
      }),
    });
    const p1 = tree.$.customers.load({ region: 'west' });
    const p2 = tree.$.customers.load({ region: 'west' });
    expect(c.n).toBe(1);
    expect(p1).toBe(p2);
    d.resolve(WEST);
    await Promise.all([p1, p2]);
    expect(tree.$.customers.all()).toEqual(WEST);
    expect(c.n).toBe(1);
  });

  it('a different key supersedes the in-flight load; the stale result never writes', async () => {
    const dWest = deferred<Cust[]>();
    const dEast = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => (region === 'west' ? dWest.promise : dEast.promise),
        key: ({ region }) => [region],
        selectId,
      }),
    });

    const pW = tree.$.customers.load({ region: 'west' });
    const pE = tree.$.customers.load({ region: 'east' }); // supersedes west

    // West resolves LATE — must be ignored (superseded).
    dWest.resolve(WEST);
    dEast.resolve(EAST);
    await Promise.all([pW, pE]); // neither hangs

    expect(tree.$.customers.currentKey()).toBe(stableStringify(['east']));
    expect(tree.$.customers.all()).toEqual(EAST);
  });
});

describe('keyed entityCollection — refresh & invalidate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('refresh(params) bypasses staleTime and key match', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => {
          c.n++;
          return of(ROWS[region]);
        },
        key: ({ region }) => [region],
        selectId,
        staleTime: '1h',
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    await tree.$.customers.refresh({ region: 'west' }); // forced despite fresh
    expect(c.n).toBe(2);
  });

  it('refresh() with no params re-runs the last-loaded scope', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => {
          c.n++;
          return of(ROWS[region]);
        },
        key: ({ region }) => [region],
        selectId,
        staleTime: '1h',
      }),
    });
    await tree.$.customers.load({ region: 'east' });
    await tree.$.customers.refresh();
    expect(c.n).toBe(2);
    expect(tree.$.customers.all()).toEqual(EAST);
  });

  it('invalidate() marks the current scope stale so the next same-key load refetches', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => {
          c.n++;
          return of(ROWS[region]);
        },
        key: ({ region }) => [region],
        selectId,
        staleTime: '1h',
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    tree.$.customers.invalidate();
    await tree.$.customers.load({ region: 'west' }); // fresh, but invalidated → refetch
    expect(c.n).toBe(2);
  });
});

describe('keyed entityCollection — errors, swr, clearOnKeyChange', () => {
  it('a loader error routes to error() and load() still resolves', async () => {
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: () => Promise.reject(new Error('nope')),
        key: ({ region }) => [region],
        selectId,
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    expect(tree.$.customers.error()).toBeInstanceOf(Error);
    expect(tree.$.customers.loaded()).toBe(false);
  });

  it('clearOnKeyChange:true blanks rows immediately on a scope change', async () => {
    const dWest = deferred<Cust[]>();
    const dEast = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => (region === 'west' ? dWest.promise : dEast.promise),
        key: ({ region }) => [region],
        selectId,
        clearOnKeyChange: true,
      }),
    });
    const pW = tree.$.customers.load({ region: 'west' });
    dWest.resolve(WEST);
    await pW;
    expect(tree.$.customers.all()).toEqual(WEST);

    // Switch scope — rows blank immediately, before the new load settles.
    const pE = tree.$.customers.load({ region: 'east' });
    expect(tree.$.customers.all()).toEqual([]);
    expect(tree.$.customers.loaded()).toBe(false);
    dEast.resolve(EAST);
    await pE;
    expect(tree.$.customers.all()).toEqual(EAST);
  });

  it('default (keep-until-settled) keeps the old scope rows during the new load', async () => {
    const dWest = deferred<Cust[]>();
    const dEast = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => (region === 'west' ? dWest.promise : dEast.promise),
        key: ({ region }) => [region],
        selectId,
      }),
    });
    const pW = tree.$.customers.load({ region: 'west' });
    dWest.resolve(WEST);
    await pW;
    const pE = tree.$.customers.load({ region: 'east' });
    // old rows still visible until east settles
    expect(tree.$.customers.all()).toEqual(WEST);
    dEast.resolve(EAST);
    await pE;
    expect(tree.$.customers.all()).toEqual(EAST);
  });
});

describe('keyed entityCollection — invalidateTag & persist', () => {
  it('invalidateTag marks a keyed collection stale', async () => {
    const c = { n: 0 };
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => {
          c.n++;
          return of(ROWS[region]);
        },
        key: ({ region }) => [region],
        selectId,
        staleTime: '1h',
        tags: ['crm'],
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    expect(invalidateTag(tree, 'crm')).toBe(1);
    await tree.$.customers.load({ region: 'west' }); // stale → refetch
    expect(c.n).toBe(2);
  });

  it('persist write-through uses a per-scope storage key', async () => {
    const store = new Map<string, string>();
    const adapter: EntityCollectionStorageAdapter = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: ({ region }) => of(ROWS[region]),
        key: ({ region }) => [region],
        selectId,
        persist: { adapter, key: 'cust' },
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    await tree.$.customers.load({ region: 'east' });
    // Each scope persisted under its own scoped key:
    expect(store.get(`cust::${stableStringify(['west'])}`)).toBe(
      JSON.stringify(WEST)
    );
    expect(store.get(`cust::${stableStringify(['east'])}`)).toBe(
      JSON.stringify(EAST)
    );
  });

  it('keyed hydrateThenRevalidate seeds a scope from its snapshot before revalidating', async () => {
    const store = new Map<string, string>([
      [`cust::${stableStringify(['west'])}`, JSON.stringify(WEST)],
    ]);
    const adapter: EntityCollectionStorageAdapter = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
    const d = deferred<Cust[]>();
    const tree = signalTree({
      customers: entityCollection<Cust, string, Scope>({
        load: () => d.promise,
        key: ({ region }) => [region],
        selectId,
        persist: { adapter, key: 'cust', hydrateThenRevalidate: true },
      }),
    });
    const p = tree.$.customers.load({ region: 'west' });
    // Seeded synchronously from cache, before the network resolves:
    expect(tree.$.customers.all()).toEqual(WEST);
    expect(tree.$.customers.loaded()).toBe(false); // seeded rows are stale
    d.resolve(EAST); // server truth differs
    await p;
    expect(tree.$.customers.all()).toEqual(EAST);
    expect(tree.$.customers.loaded()).toBe(true);
  });
});

describe('keyed entityCollection — typing (compile-time)', () => {
  it('enforces load() vs load(params) at the type level', () => {
    const keyed = signalTree({
      c: entityCollection<Cust, string, Scope>({
        load: ({ region }) => of(ROWS[region]),
        key: ({ region }) => [region],
        selectId,
      }),
    });
    const unkeyed = signalTree({
      c: entityCollection<Cust, string>({
        load: () => of(WEST),
        selectId,
      }),
    });

    // Compile-time only — these lines are type-checked by tsc but never run.
    if (false as boolean) {
      // keyed requires params:
      // @ts-expect-error keyed load() needs a scope argument
      keyed.$.c.load();
      void keyed.$.c.load({ region: 'west' });

      // unkeyed takes none:
      void unkeyed.$.c.load();
      // @ts-expect-error unkeyed load() takes no argument
      unkeyed.$.c.load({ region: 'west' });
    }

    expect(keyed.$.c.currentKey()).toBeDefined();
    expect(unkeyed.$.c.loaded()).toBeDefined();
  });
});
