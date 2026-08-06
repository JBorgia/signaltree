/**
 * Storage adapter implementations for the serialization and persistence
 * enhancers. Split out of serialization.ts so '@signaltree/core/storage' can
 * expose the adapters without pulling in the full enhancer module.
 */

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Create a custom storage adapter
 */
export function createStorageAdapter(
  getItem: (key: string) => string | null | Promise<string | null>,
  setItem: (key: string, value: string) => void | Promise<void>,
  removeItem: (key: string) => void | Promise<void>
): StorageAdapter {
  return { getItem, setItem, removeItem };
}

/**
 * IndexedDB storage adapter for large state trees
 */
export function createIndexedDBAdapter(
  dbName = 'SignalTreeDB',
  storeName = 'states'
): StorageAdapter {
  // Cache the PROMISE, not the resolved connection.
  //
  // Caching the resolved `db` left a window: `openDB` is async, so two calls
  // arriving before the first `onsuccess` both saw `db === null` and both
  // called `indexedDB.open()`. Every concurrent caller opened its own
  // connection, and the last one to resolve won the cache slot while the others
  // leaked. That is the ordinary case, not an edge case — `persist` fires
  // `getItem` for several collections during the same hydration tick.
  //
  // Caching the in-flight promise makes concurrent callers await the SAME open.
  // On failure the slot is cleared so a later call can retry rather than
  // re-await a permanently rejected promise.
  let dbPromise: Promise<IDBDatabase> | null = null;

  const openDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });

    return dbPromise;
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    },

    async setItem(key: string, value: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async removeItem(key: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}
