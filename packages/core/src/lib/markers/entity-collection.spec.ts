import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import {
  ENTITY_COLLECTION_MARKER,
  entityCollection,
  type EntityCollectionStorageAdapter,
  invalidateTag,
  isEntityCollectionMarker,
  parseDuration,
} from './entity-collection';

interface Plant {
  url: string;
  name: string;
}

const P1: Plant = { url: 'a', name: 'Aloe' };
const P2: Plant = { url: 'b', name: 'Basil' };
const P3: Plant = { url: 'c', name: 'Clover' };

const selectId = (p: Plant) => p.url;

// A deferred promise for controlling in-flight timing.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('parseDuration()', () => {
  it('passes numbers through as ms (clamped at 0)', () => {
    expect(parseDuration(0)).toBe(0);
    expect(parseDuration(1500)).toBe(1500);
    expect(parseDuration(-5)).toBe(0);
    expect(parseDuration(undefined)).toBe(0);
  });

  it('parses duration strings', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('30m')).toBe(1_800_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('1d')).toBe(86_400_000);
    expect(parseDuration('1.5h')).toBe(5_400_000);
  });

  it('throws on an unknown unit in dev', () => {
    expect(() => parseDuration('30x')).toThrow(/invalid staleTime/);
    expect(() => parseDuration('abc')).toThrow(/invalid staleTime/);
  });
});

describe('entityCollection() marker', () => {
  it('creates a marker with the expected symbol and config', () => {
    const m = entityCollection<Plant>({ load: () => of([P1]), selectId });
    expect(m[ENTITY_COLLECTION_MARKER]).toBe(true);
    expect(typeof m.config.load).toBe('function');
    expect(isEntityCollectionMarker(m)).toBe(true);
  });

  it('rejects non-markers', () => {
    expect(isEntityCollectionMarker({})).toBe(false);
    expect(isEntityCollectionMarker(null)).toBe(false);
    expect(isEntityCollectionMarker({ [ENTITY_COLLECTION_MARKER]: false })).toBe(
      false
    );
  });

  it('does not brand as an entityMap (distinct marker)', () => {
    const m = entityCollection<Plant>({ load: () => of([P1]), selectId });
    expect(
      (m as unknown as Record<string, unknown>)['__isEntityMap']
    ).toBeUndefined();
  });
});

describe('entityCollection materialization', () => {
  it('auto-loads on materialize (lazy: false) and exposes the entityMap surface', () => {
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => of([P1, P2]),
        selectId,
      }),
    });
    // Observable `of()` emits synchronously during materialize.
    expect(tree.$.plants.all()).toEqual([P1, P2]);
    expect(tree.$.plants.count()).toBe(2);
    expect(tree.$.plants.loaded()).toBe(true);
    expect(tree.$.plants.loading()).toBe(false);
    // entityMap CRUD passes through:
    tree.$.plants.addOne(P3);
    expect(tree.$.plants.count()).toBe(3);
  });

  it('does not load when lazy:true until .load() is called', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        lazy: true,
      }),
    });
    expect(calls).toBe(0);
    expect(tree.$.plants.all()).toEqual([]);
    await tree.$.plants.load();
    expect(calls).toBe(1);
    expect(tree.$.plants.all()).toEqual([P1]);
  });

  it('surfaces loader errors without marking loaded', async () => {
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => Promise.reject(new Error('boom')),
        selectId,
        lazy: true,
      }),
    });
    await tree.$.plants.load();
    expect(tree.$.plants.error()).toBeInstanceOf(Error);
    expect(tree.$.plants.loaded()).toBe(false);
    expect(tree.$.plants.loading()).toBe(false);
  });
});

describe('single-flight dedup (gap 3)', () => {
  it('coalesces concurrent load() calls into one fetch', async () => {
    let calls = 0;
    const d = deferred<Plant[]>();
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return d.promise;
        },
        selectId,
        lazy: true,
      }),
    });

    const p1 = tree.$.plants.load();
    const p2 = tree.$.plants.load();
    const p3 = tree.$.plants.load();
    expect(calls).toBe(1); // one fetch for three concurrent callers
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);

    d.resolve([P1]);
    await Promise.all([p1, p2, p3]);
    expect(tree.$.plants.all()).toEqual([P1]);
    expect(calls).toBe(1);
  });

  it('refresh() also joins an in-flight load', () => {
    let calls = 0;
    const d = deferred<Plant[]>();
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return d.promise;
        },
        selectId,
        lazy: true,
      }),
    });
    const a = tree.$.plants.load();
    const b = tree.$.plants.refresh();
    expect(a).toBe(b);
    expect(calls).toBe(1);
    d.resolve([]);
  });
});

describe('staleTime freshness guard (gap 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('default staleTime 0 → every load() refetches', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        lazy: true,
      }),
    });
    await tree.$.plants.load();
    await tree.$.plants.load();
    expect(calls).toBe(2);
  });

  it('skips refetch while fresh, refetches once stale', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        staleTime: '1h',
        lazy: true,
      }),
    });
    await tree.$.plants.load();
    expect(calls).toBe(1);
    // Still fresh 30m later → no-op.
    vi.setSystemTime(30 * 60_000);
    await tree.$.plants.load();
    expect(calls).toBe(1);
    // Past the window → refetch.
    vi.setSystemTime(61 * 60_000);
    await tree.$.plants.load();
    expect(calls).toBe(2);
  });

  it('refresh() ignores staleTime', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        staleTime: '1h',
        lazy: true,
      }),
    });
    await tree.$.plants.load();
    await tree.$.plants.refresh(); // forced despite being fresh
    expect(calls).toBe(2);
  });
});

describe('invalidate() (gap 4)', () => {
  it('marks stale so the next load() refetches', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        staleTime: '1h',
        lazy: true,
      }),
    });
    await tree.$.plants.load();
    expect(calls).toBe(1);
    // Fresh — would be a no-op…
    tree.$.plants.invalidate();
    // …but invalidation forces the refetch.
    await tree.$.plants.load();
    expect(calls).toBe(2);
  });

  it('does not fetch by itself (mark-stale only)', () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P1]);
        },
        selectId,
        lazy: true,
      }),
    });
    tree.$.plants.invalidate();
    expect(calls).toBe(0);
  });

  it('swr:false → loaded flips false on invalidate; swr:true → stays true', () => {
    const nonSwr = signalTree({
      plants: entityCollection<Plant>({ load: () => of([P1]), selectId }),
    });
    expect(nonSwr.$.plants.loaded()).toBe(true);
    nonSwr.$.plants.invalidate();
    expect(nonSwr.$.plants.loaded()).toBe(false);

    const swr = signalTree({
      plants: entityCollection<Plant>({
        load: () => of([P1]),
        selectId,
        swr: true,
      }),
    });
    expect(swr.$.plants.loaded()).toBe(true);
    swr.$.plants.invalidate();
    expect(swr.$.plants.loaded()).toBe(true); // serve stale
  });
});

describe('invalidateTag()', () => {
  it('invalidates only collections carrying the tag and returns the count', async () => {
    let plantCalls = 0;
    let orderCalls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          plantCalls++;
          return of([P1]);
        },
        selectId,
        staleTime: '1h',
        tags: ['plants', 'catalog'],
      }),
      orders: entityCollection<Plant>({
        load: () => {
          orderCalls++;
          return of([P2]);
        },
        selectId,
        staleTime: '1h',
        tags: ['orders'],
      }),
    });
    // First `.$` access finalizes the tree and triggers the (non-lazy) auto-load.
    expect(tree.$.plants.loaded()).toBe(true);
    expect(tree.$.orders.loaded()).toBe(true);
    expect(plantCalls).toBe(1);
    expect(orderCalls).toBe(1);

    const n = invalidateTag(tree, 'plants');
    expect(n).toBe(1);

    await tree.$.plants.load(); // stale → refetch
    await tree.$.orders.load(); // still fresh → no-op
    expect(plantCalls).toBe(2);
    expect(orderCalls).toBe(1);
  });

  it('matches by shared tag across multiple collections', () => {
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => of([P1]),
        selectId,
        tags: ['catalog'],
      }),
      seeds: entityCollection<Plant>({
        load: () => of([P2]),
        selectId,
        tags: ['catalog'],
      }),
    });
    expect(invalidateTag(tree, 'catalog')).toBe(2);
  });

  it('returns 0 for an unknown tag', () => {
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => of([P1]),
        selectId,
        tags: ['plants'],
      }),
    });
    expect(invalidateTag(tree, 'nope')).toBe(0);
  });
});

describe('persist hydrate-then-revalidate (gap 5)', () => {
  function memoryAdapter(seed?: unknown): EntityCollectionStorageAdapter {
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

  it('seeds rows from the snapshot instantly, then revalidates', async () => {
    const adapter = memoryAdapter([P1, P2]); // persisted snapshot
    let calls = 0;
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => {
          calls++;
          return of([P3]); // server truth differs from cache
        },
        selectId,
        persist: { adapter, key: 'plants', hydrateThenRevalidate: true },
      }),
    });
    // Seeded synchronously from cache (getItem is sync here):
    expect(tree.$.plants.all()).toEqual([P1, P2]);
    // Seeded data is stale — not marked loaded yet.
    expect(tree.$.plants.loaded()).toBe(false);

    await Promise.resolve(); // let the background load() chain run
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(tree.$.plants.all()).toEqual([P3]); // revalidated
    expect(tree.$.plants.loaded()).toBe(true);
  });

  it('write-through persists the latest rows after a load', async () => {
    const adapter = memoryAdapter();
    const setSpy = vi.spyOn(adapter, 'setItem');
    const tree = signalTree({
      plants: entityCollection<Plant>({
        load: () => of([P1]),
        selectId,
        persist: { adapter, key: 'plants' },
      }),
    });
    // First `.$` access finalizes the tree and triggers the auto-load.
    expect(tree.$.plants.loaded()).toBe(true);
    await Promise.resolve();
    expect(setSpy).toHaveBeenCalledWith('plants', JSON.stringify([P1]));
  });
});
