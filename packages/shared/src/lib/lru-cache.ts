/**
 * Minimal LRU cache implementation for internal utilities.
 *
 * The cache keeps track of insertion order to evict the least recently used
 * entry when the configured maximum size is exceeded.
 */
export class LRUCache<K, V> {
  private readonly cache = new Map<K, V>();
  constructor(private maxSize: number) {
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      throw new Error('LRUCache maxSize must be a positive, finite number');
    }
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, value);

    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    const value = this.cache.get(key);
    // Re-insert to mark as most recently used
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }

    return value;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.cache.forEach((value, key) => callback(value, key));
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Adjusts the maximum number of entries retained by the cache.
   * Shrinks immediately if the new size is smaller than the current entry
   * count by dropping the oldest items first.
   */
  resize(newSize: number): void {
    if (!Number.isFinite(newSize) || newSize <= 0) {
      throw new Error('LRUCache newSize must be a positive, finite number');
    }

    this.maxSize = newSize;

    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }
}
