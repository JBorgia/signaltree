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
  let db: IDBDatabase | null = null;

  const openDB = async (): Promise<IDBDatabase> => {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };
    });
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
