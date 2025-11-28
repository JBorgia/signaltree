import { isSignal } from '@angular/core';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class PathIndex<T extends object = WritableSignal<any>> {
  private root = new TrieNode<WeakRef<T>>();
  private pathCache = new Map<string, WeakRef<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    cleanups: 0,
  };
  private enableInstrumentation = false;
  private instrumentation = {
    incrementalUpdates: 0,
    fullRebuilds: 0,
    nodesTouched: 0,
    deletions: 0,
    rebuildDurationNs: 0,
  };

  /**
   * Set a value at the given path
   *
   * @param path - Path segments
   * @param value - Value to store
   */
  set(path: Path, signal: T): void {
    const pathStr = this.pathToString(path);
    const ref = new WeakRef(signal);

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
    if (this.enableInstrumentation) this.instrumentation.fullRebuilds++;
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
    if (!tree) {
      return;
    }

    // Check if it's a signal using Angular's isSignal
    if (isSignal(tree)) {
      this.set(path, tree as T);
      return;
    }

    // Only continue if it's an object (not a signal or primitive)
    if (typeof tree !== 'object') {
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

  /**
   * Delete an entire subtree rooted at path (including descendants).
   */
  deleteSubtree(path: Path): void {
    if (path.length === 0) {
      // Clear everything
      this.clear();
      return;
    }
    let node: TrieNode<WeakRef<T>> | undefined = this.root;
    const nodes: TrieNode<WeakRef<T>>[] = [node];
    for (const segment of path) {
      node = node.children.get(String(segment));
      if (!node) {
        return; // Nothing to delete
      }
      nodes.push(node);
    }
    // Collect all descendant path strings for cache cleanup
    const toClean: string[] = [];
    const collectPaths = (n: TrieNode<WeakRef<T>>, current: Path): void => {
      if (n.value) {
        toClean.push(this.pathToString(current));
      }
      for (const [key, child] of n.children) {
        collectPaths(child, [...current, key]);
      }
    };
    collectPaths(nodes[nodes.length - 1], path);
    for (const p of toClean) {
      this.pathCache.delete(p);
    }
    // Remove subtree from parent
    const parent = nodes[nodes.length - 2];
    parent.children.delete(String(path[path.length - 1]));
    if (this.enableInstrumentation)
      this.instrumentation.deletions += toClean.length || 1;
  }

  /**
   * Incrementally update index given changed paths and the current tree root.
   * Avoids full rebuild unless many paths changed.
   */
  incrementalUpdate(rootTree: unknown, changedPaths: string[]): void {
    const start = this.enableInstrumentation ? performance.now() : 0;
    if (!changedPaths.length) return;
    // If too many changes, perform full rebuild.
    const FULL_REBUILD_THRESHOLD = 2000; // heuristic
    if (
      changedPaths.length > FULL_REBUILD_THRESHOLD ||
      changedPaths.includes('')
    ) {
      this.clear();
      this.buildFromTree(rootTree);
      if (this.enableInstrumentation) {
        this.instrumentation.rebuildDurationNs +=
          (performance.now() - start) * 1e6;
      }
      return;
    }
    // Deduplicate and remove child paths if parent present
    const ordered = [...changedPaths].sort((a, b) => a.length - b.length);
    const effective: string[] = [];
    for (const p of ordered) {
      if (!effective.some((ep) => p !== ep && p.startsWith(ep + '.'))) {
        effective.push(p);
      }
    }
    for (const pathStr of effective) {
      const segments = pathStr === '' ? [] : pathStr.split('.');
      let subtree: unknown = rootTree;
      for (const seg of segments) {
        if (!subtree || typeof subtree !== 'object') {
          subtree = undefined;
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subtree = (subtree as any)[seg];
      }
      if (subtree === undefined || subtree === null) {
        this.deleteSubtree(segments);
        continue;
      }
      if (isSignal(subtree)) {
        this.set(segments, subtree as T);
        if (this.enableInstrumentation) this.instrumentation.nodesTouched++;
        continue;
      }
      if (typeof subtree === 'object') {
        // Replace subtree: delete then rebuild
        this.deleteSubtree(segments);
        this.buildFromTree(subtree, segments);
        if (this.enableInstrumentation) this.instrumentation.nodesTouched++;
      } else {
        // Primitive -> delete
        this.deleteSubtree(segments);
      }
    }
    if (this.enableInstrumentation) {
      this.instrumentation.incrementalUpdates++;
      this.instrumentation.rebuildDurationNs +=
        (performance.now() - start) * 1e6;
    }
  }

  /**
   * Get instrumentation stats (reset=false leaves counters intact)
   */
  setInstrumentation(enabled: boolean): void {
    this.enableInstrumentation = enabled;
  }

  getInstrumentation(reset = false): typeof this.instrumentation {
    const snapshot = { ...this.instrumentation };
    if (reset) {
      this.instrumentation.incrementalUpdates = 0;
      this.instrumentation.fullRebuilds = 0;
      this.instrumentation.nodesTouched = 0;
      this.instrumentation.deletions = 0;
      this.instrumentation.rebuildDurationNs = 0;
    }
    return snapshot;
  }
}
