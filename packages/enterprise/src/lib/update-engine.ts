import { isSignal } from '@angular/core';

import { ChangeType, DiffEngine } from './diff-engine';
import { PathIndex } from './path-index';

import type { WritableSignal } from '@angular/core';
import type { Change, DiffOptions } from './diff-engine';
import type { Path } from './path-index';
/**
 * OptimizedUpdateEngine - High-performance tree updates
 * @packageDocumentation
 */
/**
 * Update options
 */
export interface UpdateOptions extends DiffOptions {
  /** Whether to batch updates */
  batch?: boolean;

  /** Batch size for chunked updates */
  batchSize?: number;
}

/**
 * Update result
 */
export interface UpdateResult {
  /** Whether any changes were made */
  changed: boolean;

  /** Update duration in milliseconds */
  duration: number;

  /** List of changed paths */
  changedPaths: string[];

  /** Update statistics */
  stats?: {
    totalPaths: number;
    optimizedPaths: number;
    batchedUpdates: number;
  };
}

/**
 * Patch to apply
 */
interface Patch {
  type: ChangeType;
  path: Path;
  value?: unknown;
  oldValue?: unknown;
  priority: number;
  signal?: WritableSignal<unknown> | null;
}

/**
 * Apply result (internal)
 */
interface ApplyResult {
  appliedPaths: string[];
  updateCount: number;
  batchCount: number;
}

/**
 * OptimizedUpdateEngine
 *
 * High-performance update engine using path indexing and diffing to minimize
 * unnecessary signal updates.
 *
 * Features:
 * - Diff-based updates (only update what changed)
 * - Path indexing for O(k) lookups
 * - Automatic batching for large updates
 * - Priority-based patch ordering
 * - Skip unchanged values
 *
 * @example
 * ```ts
 * const tree = signalTree(data, { useLazySignals: true });
 * const engine = new OptimizedUpdateEngine(tree);
 *
 * // Optimized update - only changes what's different
 * const result = engine.update({
 *   user: { name: 'Alice' } // Only updates if name changed
 * });
 *
 * console.log(result.changedPaths); // ['user.name']
 * console.log(result.duration); // ~2ms
 * ```
 */
export class OptimizedUpdateEngine {
  private pathIndex: PathIndex;
  private diffEngine: DiffEngine;

  constructor(tree: unknown) {
    this.pathIndex = new PathIndex();
    this.diffEngine = new DiffEngine();

    // Build initial index
    this.pathIndex.buildFromTree(tree);
  }

  /**
   * Update tree with optimizations
   *
   * @param tree - Current tree state
   * @param updates - Updates to apply
   * @param options - Update options
   * @returns Update result
   */
  update(
    tree: unknown,
    updates: unknown,
    options: UpdateOptions = {}
  ): UpdateResult {
    const startTime = performance.now();

    // Step 1: Generate diff to find actual changes
    const diffOptions: Partial<DiffOptions> = {};
    if (options.maxDepth !== undefined) diffOptions.maxDepth = options.maxDepth;
    if (options.ignoreArrayOrder !== undefined)
      diffOptions.ignoreArrayOrder = options.ignoreArrayOrder;
    if (options.equalityFn !== undefined)
      diffOptions.equalityFn = options.equalityFn;

    const diff = this.diffEngine.diff(tree, updates, diffOptions);

    if (diff.changes.length === 0) {
      // No actual changes, skip update entirely
      return {
        changed: false,
        duration: performance.now() - startTime,
        changedPaths: [],
      };
    }

    // Step 2: Convert diff to optimized patches
    const patches = this.createPatches(diff.changes);

    // Step 3: Sort patches for optimal application order
    const sortedPatches = this.sortPatches(patches);

    // Step 4: Apply patches with optional batching
    const result = options.batch
      ? this.batchApplyPatches(tree, sortedPatches, options.batchSize)
      : this.applyPatches(tree, sortedPatches);

    const duration = performance.now() - startTime;

    return {
      changed: true,
      duration,
      changedPaths: result.appliedPaths,
      stats: {
        totalPaths: diff.changes.length,
        optimizedPaths: patches.length,
        batchedUpdates: result.batchCount,
      },
    };
  }

  /**
   * Rebuild path index from current tree state
   *
   * @param tree - Current tree
   */
  rebuildIndex(tree: unknown): void {
    this.pathIndex.clear();
    this.pathIndex.buildFromTree(tree);
  }

  /**
   * Get path index statistics
   */
  getIndexStats(): ReturnType<PathIndex['getStats']> {
    return this.pathIndex.getStats();
  }

  /**
   * Creates optimized patches from diff changes
   */
  private createPatches(changes: Change[]): Patch[] {
    const patches: Patch[] = [];
    const processedPaths = new Set<string>();

    for (const change of changes) {
      const pathStr = change.path.join('.');

      // Skip if parent path already processed (optimization)
      let skipPath = false;
      for (const processed of processedPaths) {
        if (pathStr.startsWith(processed + '.')) {
          skipPath = true;
          break;
        }
      }

      if (skipPath) {
        continue;
      }

      // Create patch based on change type
      const patch = this.createPatch(change);
      patches.push(patch);

      // Mark path as processed
      processedPaths.add(pathStr);

      // If this is an object replacement, skip child paths
      if (
        change.type === ChangeType.REPLACE &&
        typeof change.value === 'object'
      ) {
        processedPaths.add(pathStr);
      }
    }

    return patches;
  }

  /**
   * Creates a single patch from a change
   */
  private createPatch(change: Change): Patch {
    return {
      type: change.type,
      path: change.path,
      value: change.value,
      oldValue: change.oldValue,
      priority: this.calculatePriority(change),
      signal: this.pathIndex.get(change.path),
    };
  }

  /**
   * Calculates update priority for optimal ordering
   */
  private calculatePriority(change: Change): number {
    let priority = 0;

    // Shallow updates have higher priority
    priority += (10 - change.path.length) * 10;

    // Array updates have lower priority (more expensive)
    if (change.path.some((p) => typeof p === 'number')) {
      priority -= 20;
    }

    // Replace operations have higher priority than nested updates
    if (change.type === ChangeType.REPLACE) {
      priority += 30;
    }

    return priority;
  }

  /**
   * Sorts patches for optimal application
   */
  private sortPatches(patches: Patch[]): Patch[] {
    return patches.sort((a, b) => {
      // Sort by priority (higher first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Then by path depth (shallow first)
      return a.path.length - b.path.length;
    });
  }

  /**
   * Applies patches directly (no batching)
   */
  private applyPatches(tree: unknown, patches: Patch[]): ApplyResult {
    const appliedPaths: string[] = [];
    let updateCount = 0;

    for (const patch of patches) {
      if (this.applyPatch(patch, tree)) {
        appliedPaths.push(patch.path.join('.'));
        updateCount++;
      }
    }

    return {
      appliedPaths,
      updateCount,
      batchCount: 1,
    };
  }

  /**
   * Applies patches with batching for better performance
   */
  private batchApplyPatches(
    tree: unknown,
    patches: Patch[],
    batchSize = 50
  ): ApplyResult {
    const batches: Patch[][] = [];

    for (let i = 0; i < patches.length; i += batchSize) {
      batches.push(patches.slice(i, i + batchSize));
    }

    const appliedPaths: string[] = [];
    let updateCount = 0;

    // Process patches in batches
    for (const currentBatch of batches) {
      for (const patch of currentBatch) {
        if (this.applyPatch(patch, tree)) {
          appliedPaths.push(patch.path.join('.'));
          updateCount++;
        }
      }
    }

    return {
      appliedPaths,
      updateCount,
      batchCount: batches.length,
    };
  }

  /**
   * Applies a single patch to the tree object
   */
  private applyPatch(patch: Patch, tree: unknown): boolean {
    try {
      // First, try to update via signal if available
      if (patch.signal && isSignal(patch.signal) && 'set' in patch.signal) {
        const currentValue = patch.signal();

        // Only update if value actually changed
        if (this.isEqual(currentValue, patch.value)) {
          return false;
        }

        // Update the signal - this will handle reactivity
        (patch.signal as WritableSignal<unknown>).set(patch.value);

        // After successful ADD, update the index
        if (patch.type === ChangeType.ADD && patch.value !== undefined) {
          this.pathIndex.set(patch.path, patch.signal);
        }

        return true;
      } // Fallback: Navigate to parent object and update directly
      let current: Record<string, unknown> = tree as Record<string, unknown>;
      for (let i = 0; i < patch.path.length - 1; i++) {
        const key = patch.path[i];
        current = current[key] as Record<string, unknown>;
        if (!current || typeof current !== 'object') {
          return false;
        }
      }

      const lastKey = patch.path[patch.path.length - 1];

      // Only update if value actually changed
      if (this.isEqual(current[lastKey], patch.value)) {
        return false;
      }

      // Apply update directly to object
      current[lastKey] = patch.value;
      return true;
    } catch (error) {
      console.error(`Failed to apply patch at ${patch.path.join('.')}:`, error);
      return false;
    }
  }
  /**
   * Check equality
   */
  private isEqual(a: unknown, b: unknown): boolean {
    // Fast path: strict equality or identical reference
    if (a === b) return true;
    // If types differ we can exit early
    if (typeof a !== typeof b) return false;
    // Handle null / primitives after previous checks
    if (a === null || b === null) return false;
    if (typeof a !== 'object') return false;

    // Shallow object/array fast path: compare keys/length then selected entries
    // Avoid expensive JSON stringify for common small structures.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ao = a as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bo = b as any;
    if (Array.isArray(ao) && Array.isArray(bo)) {
      if (ao.length !== bo.length) return false;
      for (let i = 0; i < ao.length; i++) {
        if (ao[i] !== bo[i]) return false;
      }
      return true;
    }
    // Objects: compare own keys length & identity of each value (shallow)
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      const k = aKeys[i];
      if (!(k in bo)) return false;
      if (ao[k] !== bo[k]) return false;
    }
    // Fallback deep compare only when shallow matched but references differ (rare)
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
}
