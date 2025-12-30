import { PathIndex } from './path-index';
import { OptimizedUpdateEngine, UpdateResult } from './update-engine';

import type { Signal } from '@angular/core';
import type { Enhancer } from '@signaltree/core';
/**
 * Enterprise-grade optimizations for large-scale applications.
 *
 * **Includes:**
 * - Diff-based updates (only update changed signals)
 * - Bulk operation optimization (2-5x faster)
 * - Advanced change tracking
 * - Update statistics and monitoring
 *
 * **Use when:**
 * - 500+ signals in state tree
 * - Bulk updates at high frequency (60Hz+)
 * - Real-time dashboards or data feeds
 * - Enterprise-scale applications
 *
 * **Skip when:**
 * - Small to medium apps (<100 signals)
 * - Infrequent state updates
 * - Startup/prototype projects
 *
 * **Bundle cost:** +2.4KB gzipped
 * **Performance gain:** 2-5x faster bulk updates, detailed monitoring
 *
 * @example
 * ```typescript
 * import { signalTree } from '@signaltree/core';
 * import { withEnterprise } from '@signaltree/enterprise';
 *
 * const tree = signalTree(largeState).with(withEnterprise());
 *
 * // Now available: optimized bulk updates
 * const result = tree.updateOptimized(newData, {
 *   ignoreArrayOrder: true,
 *   maxDepth: 10
 * });
 *
 * console.log(result.stats);
 * // { totalChanges: 45, adds: 10, updates: 30, deletes: 5 }
 * ```
 *
 * @public
 */
export function withEnterprise(): <
  Tree extends import('@signaltree/core').SignalTree<any>
>(
  tree: Tree
) => Tree & import('@signaltree/enterprise').EnterpriseEnhancedTree<any> {
  return <Tree extends import('@signaltree/core').SignalTree<any>>(
    tree: Tree
  ): Tree & import('@signaltree/enterprise').EnterpriseEnhancedTree<any> => {
    type S = Tree extends import('@signaltree/core').SignalTree<infer U>
      ? U
      : unknown;
    // Lazy initialization - only create when first needed
    let pathIndex: PathIndex<Signal<unknown>> | null = null;
    let updateEngine: OptimizedUpdateEngine | null = null;

    // Type assertion to access SignalTree properties (preserve S)
    const signalTree = tree as unknown as { state: S };
    // Cast tree to enhanced type for safe property assignment
    const enhancedTree = tree as unknown as
      | (Tree & import('@signaltree/enterprise').EnterpriseEnhancedTree<S>)
      | (Tree & import('@signaltree/enterprise').EnterpriseEnhancedTree<any>);

    // Add updateOptimized method to tree
    enhancedTree.updateOptimized = (
      updates: Partial<S>,
      options?: {
        maxDepth?: number;
        ignoreArrayOrder?: boolean;
        equalityFn?: (a: unknown, b: unknown) => boolean;
        autoBatch?: boolean;
        batchSize?: number;
      }
    ): UpdateResult => {
      // Lazy initialize on first use
      if (!updateEngine) {
        pathIndex = new PathIndex<Signal<unknown>>();
        pathIndex.buildFromTree(signalTree.state);
        updateEngine = new OptimizedUpdateEngine(signalTree.state);
      }

      const result = updateEngine.update(signalTree.state, updates, options);

      // Rebuild index if changes were made
      if (result.changed && pathIndex) {
        if (result.changedPaths.length) {
          // Use incremental update logic instead of full rebuild
          pathIndex.incrementalUpdate(signalTree.state, result.changedPaths);
        } else {
          // Fallback full rebuild
          pathIndex.clear();
          pathIndex.buildFromTree(signalTree.state);
        }
      }

      return result;
    };

    // Add PathIndex access for debugging/monitoring
    enhancedTree.getPathIndex = () => pathIndex;

    return enhancedTree as unknown as Tree &
      import('@signaltree/enterprise').EnterpriseEnhancedTree<any>;
  };
}

/**
 * Type augmentation for trees enhanced with enterprise features.
 * This is applied when using withEnterprise().
 *
 * @public
 */
export interface EnterpriseEnhancedTree<T> {
  /**
   * Optimized bulk update method using diff-based change detection.
   * Only available when using withEnterprise().
   *
   * @param newValue - The new state value
   * @param options - Update options
   * @returns Update result with statistics
   */
  updateOptimized(
    newValue: T,
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
   * Get the PathIndex for debugging/monitoring.
   * Only available when using withEnterprise().
   * Returns null if updateOptimized hasn't been called yet (lazy initialization).
   */
  getPathIndex(): PathIndex<Signal<unknown>> | null;
}
