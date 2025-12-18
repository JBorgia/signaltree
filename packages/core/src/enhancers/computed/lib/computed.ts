import { computed, Signal } from '@angular/core';

import { createEnhancer } from '../..';

import type { TreeNode, SignalTree } from '../../../lib/types';

/**
 * Configuration for the computed enhancer
 */
export interface ComputedConfig {
  /** Whether to enable lazy evaluation */
  lazy?: boolean;
  /** Whether to memoize computed values */
  memoize?: boolean;
}

/**
 * Computed signal type for derived state
 */
export type ComputedSignal<T> = Signal<T>;

/**
 * Extended SignalTree with computed signal capabilities
 */
export interface ComputedSignalTree<T extends Record<string, unknown>>
  extends SignalTree<T> {
  /**
   * Create a computed signal from the current tree state
   * @param computeFn Function that computes the derived value
   * @returns A computed signal that updates when dependencies change
   */
  computed<U>(computeFn: (tree: TreeNode<T>) => U): ComputedSignal<U>;
}

/**
 * Computed enhancer factory function
 * @param config Configuration options for computed signals
 * @returns Enhancer that adds computed signal functionality
 *
 * @example
 * ```typescript
 * import { signalTree, computedEnhancer } from '@signaltree/core';
 *
 * const state = signalTree(
 *   { count: 0, multiplier: 2 },
 *   { enhancers: [computedEnhancer()] }
 * );
 *
 * // Create a computed signal
 * const doubled = state.computed(tree => tree.count() * tree.multiplier());
 *
 * console.log(doubled()); // 0
 * state.count.set(5);
 * console.log(doubled()); // 10
 * ```
 */
export function computedEnhancer(_config: ComputedConfig = {}) {
  void _config;
  return createEnhancer<
    SignalTree<Record<string, unknown>>,
    ComputedSignalTree<Record<string, unknown>>
  >(
    {
      name: 'computed',
      provides: ['computed'],
      requires: [],
    },
    (tree) => {
      const computedTree = tree as ComputedSignalTree<Record<string, unknown>>;

      // Add computed method to the tree
      computedTree.computed = function <U>(
        computeFn: (tree: TreeNode<Record<string, unknown>>) => U
      ): ComputedSignal<U> {
        return computed(() => computeFn(tree.state));
      };

      return computedTree;
    }
  );
}

/**
 * Utility function to create a computed signal from multiple dependencies
 * @param dependencies Array of signals to depend on
 * @param computeFn Function that computes the result
 * @returns Computed signal
 *
 * @example
 * ```typescript
 * import { signal } from '@angular/core';
 * import { createComputed } from '@signaltree/core';
 *
 * const a = signal(1);
 * const b = signal(2);
 * const sum = createComputed([a, b], () => a() + b());
 * ```
 */
export function createComputed<T>(
  dependencies: readonly Signal<unknown>[],
  computeFn: () => T
): ComputedSignal<T> {
  return computed(computeFn);
}
