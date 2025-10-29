/**
 * PathIndex - Fast signal lookup using Trie data structure
 * @packageDocumentation
 */

import type { WritableSignal } from '@angular/core';

/**
 * Path segment (string or number for array indices)
 */
export type PathSegment = string | number;

/**
 * Path as array of segments
 */
export type Path = PathSegment[];

/**
 * Node in the Trie structure
 */
class TrieNode<T> {
  value: T | null = null;
  children = new Map<string, TrieNode<T>>();
}

/**
 * PathIndex
 *
 * Fast signal lookup using a Trie (prefix tree) data structure.
 * Provides O(k) lookup time where k is the path length, regardless of total signals.
 *
 * Features:
 * - Trie-based indexing for O(k) lookup
 * - WeakRef caching for memory efficiency
 * - Automatic cleanup of stale references
 * - Prefix matching for batch operations
 * - Path normalization
 *
 * @example
 * ```ts
 * const index = new PathIndex();
 *
 * // Index signals
 * index.set(['user', 'name'], nameSignal);
 * index.set(['user', 'email'], emailSignal);
 *
 * // Fast lookup
 * const signal = index.get(['user', 'name']);
 *
 * // Prefix matching
 * const userSignals = index.getByPrefix(['user']);
 * // Returns: { name: nameSignal, email: emailSignal }
 *
 * // Check if path exists
 * if (index.has(['user', 'name'])) {
 *   // ...
 * }
 * ```
 */
export class PathIndex<T extends object = WritableSignal<unknown>> {
  private root = new TrieNode<WeakRef<T>>();
  private pathCache = new Map<string, WeakRef<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    cleanups: 0,
  };

  /**
   * Set a value at the given path
   *
   * @param path - Path segments
   * @param value - Value to store
   */
  set(path: Path, value: T): void {
    const pathStr = this.pathToString(path);
    const ref = new WeakRef(value);

    // Update trie
    let node = this.root;
    for (const segment of path) {
      const key = String(segment);
      if (!node.children.has(key)) {
        node.children.set(key, new TrieNode<WeakRef<T>>());
      }
      const nextNode = node.children.get(key);
      if (!nextNode) {
        throw new Error(`Failed to get node for key: ${key}`);
      }
      node = nextNode;
    }
    node.value = ref;

    // Update cache for fast string lookups
    this.pathCache.set(pathStr, ref);

    this.stats.sets++;
  }

  /**
   * Get value at the given path
   *
   * @param path - Path segments
   * @returns Value if found and not GC'd, null otherwise
   */
  get(path: Path): T | null {
    const pathStr = this.pathToString(path);

    // Try cache first
    const cached = this.pathCache.get(pathStr);
    if (cached) {
      const value = cached.deref();
      if (value) {
        this.stats.hits++;
        return value;
      }
      // Clean up dead reference
      this.pathCache.delete(pathStr);
      this.stats.cleanups++;
    }

    // Try trie
    let node: TrieNode<WeakRef<T>> | undefined = this.root;
    for (const segment of path) {
      const key = String(segment);
      node = node.children.get(key);
      if (!node) {
        this.stats.misses++;
        return null;
      }
    }

    if (node.value) {
      const value = node.value.deref();
      if (value) {
        // Re-cache for next time
        this.pathCache.set(pathStr, node.value);
        this.stats.hits++;
        return value;
      }
      // Clean up dead reference
      node.value = null;
      this.stats.cleanups++;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Check if path exists in index
   *
   * @param path - Path segments
   * @returns True if path exists and value is not GC'd
   */
  has(path: Path): boolean {
    return this.get(path) !== null;
  }

  /**
   * Get all values matching a prefix
   *
   * @param prefix - Path prefix
   * @returns Map of relative paths to values
   */
  getByPrefix(prefix: Path): Map<string, T> {
    const results = new Map<string, T>();

    // Find the node at prefix
    let node: TrieNode<WeakRef<T>> | undefined = this.root;
    for (const segment of prefix) {
      const key = String(segment);
      node = node.children.get(key);
      if (!node) {
        return results; // Empty map
      }
    }

    // Collect all descendants
    this.collectDescendants(node, [], results);

    return results;
  }

  /**
   * Delete value at path
   *
   * @param path - Path segments
   * @returns True if deleted, false if not found
   */
  delete(path: Path): boolean {
    const pathStr = this.pathToString(path);

    // Remove from cache
    this.pathCache.delete(pathStr);

    // Remove from trie
    let node: TrieNode<WeakRef<T>> | undefined = this.root;
    const nodes: TrieNode<WeakRef<T>>[] = [node];

    for (const segment of path) {
      const key = String(segment);
      node = node.children.get(key);
      if (!node) {
        return false;
      }
      nodes.push(node);
    }

    // Clear value
    const hadValue = node.value !== null;
    node.value = null;

    // Clean up empty nodes (from leaf to root)
    for (let i = nodes.length - 1; i > 0; i--) {
      const current = nodes[i];
      if (current.value === null && current.children.size === 0) {
        const parent = nodes[i - 1];
        const segment = path[i - 1];
        parent.children.delete(String(segment));
      } else {
        break; // Stop if node has value or children
      }
    }

    return hadValue;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.root = new TrieNode<WeakRef<T>>();
    this.pathCache.clear();
  }

  /**
   * Get statistics
   *
   * @returns Index statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    sets: number;
    cleanups: number;
    hitRate: number;
    cacheSize: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      ...this.stats,
      hitRate,
      cacheSize: this.pathCache.size,
    };
  }

  /**
   * Build index from a tree structure
   *
   * @param tree - Tree object to index
   * @param path - Current path (for recursion)
   */
  buildFromTree(tree: unknown, path: Path = []): void {
    if (!tree || typeof tree !== 'object') {
      return;
    }

    // Check if it's a signal
    if (typeof tree === 'function' && 'set' in tree) {
      this.set(path, tree as T);
      return;
    }

    // Recursively index children
    for (const [key, value] of Object.entries(tree)) {
      this.buildFromTree(value, [...path, key]);
    }
  }

  /**
   * Convert path to string for caching
   */
  private pathToString(path: Path): string {
    return path.join('.');
  }

  /**
   * Collect all descendant values recursively
   */
  private collectDescendants(
    node: TrieNode<WeakRef<T>>,
    currentPath: PathSegment[],
    results: Map<string, T>
  ): void {
    // Add current node's value if it exists
    if (node.value) {
      const value = node.value.deref();
      if (value) {
        results.set(this.pathToString(currentPath), value);
      }
    }

    // Recursively collect children
    for (const [key, child] of node.children) {
      this.collectDescendants(child, [...currentPath, key], results);
    }
  }
}
