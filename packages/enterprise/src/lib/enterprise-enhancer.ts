import { PathIndex } from './path-index';
import { OptimizedUpdateEngine, UpdateResult } from './update-engine';

import type { Signal } from '@angular/core';
import type { ISignalTree } from '@signaltree/core';

/**
 * Listener fired after `updateOptimized` (or auto-optimized `update`)
 * completes, with the dot-paths that actually changed.
 *
 * @public
 */
export type PathChangeListener = (changedPaths: readonly string[]) => void;

/**
 * Configuration options for the `enterprise()` enhancer.
 *
 * @public
 */
export interface EnterpriseOptions {
  /**
   * When set, automatically routes any partial update of size >=
   * `autoOptimizeThreshold` (top-level keys) through the diff engine
   * instead of the standard recursive update.
   *
   * Off by default — opt-in because it adds wrapper overhead to every
   * `update()` call site that gets intercepted.
   *
   * @default undefined (manual `updateOptimized` only)
   */
  autoOptimizeThreshold?: number;
}

/**
 * Diff-based bulk updates for a SignalTree.
 *
 * @deprecated Since 13.5.0. Use `tree.updateAndReport()` and
 * `tree.onPathChange()` from `@signaltree/core` — both are built in, need no
 * enhancer, and are faster. This enhancer is maintained for security fixes
 * only. See the migration table in the package docs.
 *
 * **Why it was retired**
 *
 * The headline claim was inverted. Measured against `tree.updateAndReport()`,
 * which returns the same changed paths, this is SLOWER in every workload
 * measured — at 2,000 leaves, ~7x when 10% of leaves change and ~160-190x when
 * every leaf changes — and the ratio grows with tree size. That is structural, not a
 * tuning problem: core leaves are `signal(value, { equal })` with deep equality
 * plus a reference-equality short-circuit, so "write only what changed" is
 * already core behaviour — the diff engine pays O(state) to skip writes that
 * were already no-ops.
 *
 * **Known defect, not being fixed:** `updateOptimized()` silently drops writes
 * that target an array — it reports `changed: true` and writes nothing. Write
 * arrays through their leaf (`tree.$.users.set(next)`) or use
 * `updateAndReport()`, which handles them correctly.
 *
 * **Bundle cost:** ~3.8KB gzipped (measured on a tree-shaken consumer).
 *
 * @example
 * ```typescript
 * // DEPRECATED
 * const tree = signalTree(largeState).with(enterprise());
 * const result = tree.updateOptimized(newData);
 * if (result.changed) sync(result.changedPaths);
 *
 * // Replacement — no enhancer, no extra bundle
 * const tree = signalTree(largeState);
 * const changed = tree.updateAndReport(newData);
 * if (changed.length) sync(changed);
 * ```
 *
 * @public
 */
export function enterprise<T = unknown>(
  options: EnterpriseOptions = {}
): (
  tree: ISignalTree<T>
) => ISignalTree<T> & EnterpriseEnhancedTree<T> {
  return (tree: ISignalTree<T>): ISignalTree<T> & EnterpriseEnhancedTree<T> => {
    // Lazy initialization - only create when first needed
    let pathIndex: PathIndex<Signal<unknown>> | null = null;
    let updateEngine: OptimizedUpdateEngine | null = null;
    const listeners = new Set<PathChangeListener>();

    // Type assertion to access SignalTree properties
    const signalTree = tree as unknown as { $: T };
    // Cast tree to enhanced type for safe property assignment
    const enhancedTree = tree as ISignalTree<T> & EnterpriseEnhancedTree<T>;

    const ensureEngine = () => {
      if (!updateEngine) {
        pathIndex = new PathIndex<Signal<unknown>>();
        pathIndex.buildFromTree(signalTree.$);
        updateEngine = new OptimizedUpdateEngine(signalTree.$);
      }
      return updateEngine;
    };

    const notifyListeners = (paths: readonly string[]) => {
      if (!listeners.size || !paths.length) return;
      for (const fn of Array.from(listeners)) {
        try {
          fn(paths);
        } catch {
          // listener errors must not break the update pipeline
        }
      }
    };

    const runOptimized = (
      updates: Partial<T>,
      opts?: Parameters<EnterpriseEnhancedTree<T>['updateOptimized']>[1]
    ): UpdateResult => {
      const engine = ensureEngine();
      const result = engine.update(signalTree.$, updates, opts);
      if (result.changed && pathIndex) {
        if (result.changedPaths.length) {
          pathIndex.incrementalUpdate(signalTree.$, result.changedPaths);
        } else {
          pathIndex.clear();
          pathIndex.buildFromTree(signalTree.$);
        }
      }
      notifyListeners(result.changedPaths);
      return result;
    };

    // Add updateOptimized method to tree
    enhancedTree.updateOptimized = runOptimized;

    // onPathChange — subscribe to "what just changed" events for any path
    // mutated through updateOptimized (or via autoOptimizeThreshold).
    enhancedTree.onPathChange = (listener: PathChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    // snapshot/restore — opaque structural snapshots backed by the diff
    // engine. `restore` applies the snapshot via updateOptimized so only
    // changed paths are written and listeners fire correctly.
    enhancedTree.snapshot = (): unknown => {
      // Cheap structural clone of current unwrapped state.
      const current = (tree as unknown as () => T)();
      return structuredClone(current);
    };
    enhancedTree.restore = (snapshot: unknown): UpdateResult => {
      return runOptimized(snapshot as Partial<T>);
    };

    // autoOptimizeThreshold — wrap the tree's call form so partial updates
    // above the threshold are routed through the diff engine. Off unless
    // the consumer opts in.
    const threshold = options.autoOptimizeThreshold;
    if (threshold && threshold > 0) {
      const originalCall = (tree as unknown as (arg?: unknown) => unknown).bind(
        tree
      );
      const wrapped = function (this: unknown, arg?: unknown) {
        if (
          arguments.length === 1 &&
          arg &&
          typeof arg === 'object' &&
          !Array.isArray(arg) &&
          Object.keys(arg as object).length >= threshold
        ) {
          runOptimized(arg as Partial<T>);
          return;
        }
        return originalCall(arg);
      };
      // Re-expose call form. The tree itself is a NodeAccessor (callable),
      // so we replace internal forwarding via prototype-less proxy:
      // simplest path is to expose `tree.updateAuto` and document it,
      // since the call signature lives on the function object itself and
      // can't be cleanly overridden post-construction. The wrapped fn
      // is also surfaced as `updateAuto` for explicit use.
      enhancedTree.updateAuto = wrapped as (arg?: unknown) => unknown;
    } else {
      enhancedTree.updateAuto = (arg?: unknown) =>
        (tree as unknown as (arg?: unknown) => unknown)(arg);
    }

    // Add PathIndex access for debugging/monitoring
    enhancedTree.getPathIndex = () => pathIndex;

    return enhancedTree;
  };
}

/**
 * Type augmentation for trees enhanced with enterprise features.
 * This is applied when using enterprise().
 *
 * @public
 */
export interface EnterpriseEnhancedTree<T> {
  /**
   * Optimized bulk update method using diff-based change detection.
   * Only available when using enterprise().
   *
   * @param updates - Partial state updates to apply
   * @param options - Update options
   * @returns Update result with statistics
   */
  updateOptimized(
    updates: Partial<T>,
    options?: {
      /** Maximum depth to traverse (default: 100) */
      maxDepth?: number;
      /** Ignore array element order (default: false) */
      ignoreArrayOrder?: boolean;
      /** Custom equality function */
      equalityFn?: (a: unknown, b: unknown) => boolean;
      /** Automatically batch updates (default: true) */
      autoBatch?: boolean;
      /** Number of patches per batch (default: 10) */
      batchSize?: number;
    }
  ): UpdateResult;

  /**
   * Subscribe to "what just changed" events emitted whenever
   * `updateOptimized` (or `updateAuto` above the threshold) applies a
   * non-empty diff. The listener receives the dot-paths that changed.
   *
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const off = tree.onPathChange((paths) => persist(paths));
   * // ...later
   * off();
   * ```
   */
  onPathChange(listener: PathChangeListener): () => void;

  /**
   * Take an opaque structural snapshot of the current state.
   * Pair with `restore()` for time-travel use cases. The snapshot is a
   * deep clone, so it survives subsequent mutations to the live tree.
   */
  snapshot(): unknown;

  /**
   * Apply a previously-taken snapshot via the diff engine. Only the
   * paths whose values differ from the live tree are re-set, and
   * `onPathChange` listeners fire with the changed paths.
   */
  restore(snapshot: unknown): UpdateResult;

  /**
   * Convenience call form that automatically routes large partial
   * updates through the diff engine when `autoOptimizeThreshold` is
   * configured. Smaller updates fall through to the tree's standard
   * `set()`-based path. Behaviourally equivalent to calling the tree
   * itself when no threshold is configured.
   */
  updateAuto(updates: unknown): unknown;

  /**
   * @deprecated Internal/debug accessor. Will be removed from the
   * public API in a future major release; prefer `onPathChange` /
   * `snapshot` for observable diff workflows.
   */
  getPathIndex(): PathIndex<Signal<unknown>> | null;
}
