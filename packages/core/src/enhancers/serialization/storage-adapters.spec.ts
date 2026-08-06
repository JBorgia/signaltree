import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createIndexedDBAdapter,
  createStorageAdapter,
} from './storage-adapters';

/**
 * `@signaltree/core/storage` is PUBLIC API — `createIndexedDBAdapter()` is what
 * the entity cookbook and llms.txt tell people to pass to
 * `loader({ persist: { adapter } })` — and it had **zero** test coverage.
 *
 * Rather than take a `fake-indexeddb` dependency for three methods, this stubs
 * the slice of the IndexedDB surface the adapter actually touches: `open`,
 * `onupgradeneeded`, `transaction`, `objectStore`, and `get`/`put`/`delete`.
 * Requests resolve on a later tick, which is what makes the concurrency test
 * below meaningful — a synchronous stub could not have caught the bug it pins.
 */
interface StubRequest<T = unknown> {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: ((e: { target: { result: unknown } }) => void) | null;
}

/** Settle a stub request asynchronously, like the real thing. */
const settle = (req: StubRequest, ok: boolean) =>
  queueMicrotask(() => (ok ? req.onsuccess?.() : req.onerror?.()));

function makeStubIndexedDB() {
  const data = new Map<string, string>();
  const stores = new Set<string>();
  let openCount = 0;
  let failNextOpen = false;

  const objectStore = {
    get: (key: string) => {
      const r: StubRequest = {
        result: data.get(key),
        error: null,
        onsuccess: null,
        onerror: null,
      };
      settle(r, true);
      return r;
    },
    put: (value: string, key: string) => {
      const r: StubRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      data.set(key, value);
      settle(r, true);
      return r;
    },
    delete: (key: string) => {
      const r: StubRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      data.delete(key);
      settle(r, true);
      return r;
    },
  };

  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => stores.add(n),
    transaction: () => ({ objectStore: () => objectStore }),
  };

  const indexedDB = {
    open: () => {
      openCount++;
      const req: StubRequest = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      if (failNextOpen) {
        req.error = new Error('open failed');
        settle(req, false);
        return req;
      }
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: { result: db } });
        req.onsuccess?.();
      });
      return req;
    },
  };

  return {
    indexedDB,
    data,
    stores,
    openCount: () => openCount,
    failNextOpen: (v: boolean) => (failNextOpen = v),
  };
}

describe('createStorageAdapter', () => {
  it('returns the three functions it was given, unwrapped', () => {
    const get = vi.fn(() => 'v');
    const set = vi.fn();
    const remove = vi.fn();
    const a = createStorageAdapter(get, set, remove);

    expect(a.getItem('k')).toBe('v');
    a.setItem('k', 'v');
    a.removeItem('k');

    expect(get).toHaveBeenCalledWith('k');
    expect(set).toHaveBeenCalledWith('k', 'v');
    expect(remove).toHaveBeenCalledWith('k');
  });

  it('supports async implementations', async () => {
    const store = new Map<string, string>();
    const a = createStorageAdapter(
      async (k) => store.get(k) ?? null,
      async (k, v) => void store.set(k, v),
      async (k) => void store.delete(k)
    );

    await a.setItem('k', 'v');
    await expect(a.getItem('k')).resolves.toBe('v');
    await a.removeItem('k');
    await expect(a.getItem('k')).resolves.toBeNull();
  });
});

describe('createIndexedDBAdapter', () => {
  let stub: ReturnType<typeof makeStubIndexedDB>;

  beforeEach(() => {
    stub = makeStubIndexedDB();
    (globalThis as Record<string, unknown>)['indexedDB'] = stub.indexedDB;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['indexedDB'];
  });

  it('round-trips a value', async () => {
    const a = createIndexedDBAdapter();

    await a.setItem('theme', 'dark');
    await expect(a.getItem('theme')).resolves.toBe('dark');

    await a.removeItem('theme');
    await expect(a.getItem('theme')).resolves.toBeNull();
  });

  it('returns null for a missing key rather than undefined', async () => {
    // `persist` branches on `=== null`; `undefined` would read as "present".
    await expect(createIndexedDBAdapter().getItem('nope')).resolves.toBeNull();
  });

  it('creates the object store on upgrade, once', async () => {
    const a = createIndexedDBAdapter('DB', 'my-store');
    await a.setItem('k', 'v');

    expect(stub.stores.has('my-store')).toBe(true);
  });

  it('honours custom db and store names', async () => {
    const a = createIndexedDBAdapter('OtherDB', 'other-store');
    await a.setItem('k', 'v');

    expect(stub.stores.has('other-store')).toBe(true);
    expect(stub.data.get('k')).toBe('v');
  });

  it('OPENS THE DATABASE ONCE UNDER CONCURRENCY — the race this had', async () => {
    // `openDB` used to cache the RESOLVED connection, so callers arriving
    // before the first `onsuccess` all saw `null` and each opened their own.
    // That is the ordinary case: `persist` fires getItem for several
    // collections in one hydration tick.
    const a = createIndexedDBAdapter();

    await Promise.all([
      a.getItem('a'),
      a.getItem('b'),
      a.setItem('c', '1'),
      a.removeItem('d'),
    ]);

    expect(stub.openCount()).toBe(1);
  });

  it('reuses the connection across sequential calls', async () => {
    const a = createIndexedDBAdapter();
    await a.setItem('k', '1');
    await a.getItem('k');
    await a.removeItem('k');

    expect(stub.openCount()).toBe(1);
  });

  it('rejects when the database cannot be opened', async () => {
    stub.failNextOpen(true);
    const a = createIndexedDBAdapter();

    await expect(a.getItem('k')).rejects.toBeTruthy();
  });

  it('a failed open is RETRIED, not cached forever', async () => {
    // Caching a rejected promise would leave the adapter permanently broken
    // after one transient failure (a locked DB, a private-mode restriction).
    stub.failNextOpen(true);
    const a = createIndexedDBAdapter();
    await expect(a.getItem('k')).rejects.toBeTruthy();

    stub.failNextOpen(false);
    await a.setItem('k', 'v');
    await expect(a.getItem('k')).resolves.toBe('v');
  });
});
