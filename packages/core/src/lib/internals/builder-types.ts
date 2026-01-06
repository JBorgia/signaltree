/**
 * SignalTree Builder Types
 *
 * Type definitions for the SignalTreeBuilder used in v7.
 */
import type { Signal } from '@angular/core';

import type { ProcessDerived } from './derived-types';
import type { ISignalTree, TreeNode } from '../types';

// =============================================================================
// SIGNAL TREE BUILDER
// =============================================================================

/**
 * Builder for constructing SignalTree with chained derived layers.
 * Provides fluent API for adding derived state and enhancers.
 *
 * @typeParam TSource - The raw source state type
 * @typeParam TAccum - The accumulated $ type (TreeNode<TSource> & derived signals)
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 })
 *   .derived(($) => ({
 *     doubled: derived(() => $.count() * 2)
 *   }))
 *   .derived(($) => ({
 *     quadrupled: derived(() => $.doubled() * 2)  // ✓ $.doubled is typed
 *   }))
 *   .with(entities());
 * ```
 */
export interface SignalTreeBuilder<TSource, TAccum = TreeNode<TSource>> {
  // Callable (backward compatible with NodeAccessor)
  (): TSource;
  (value: Partial<TSource>): void;
  (updater: (current: TSource) => TSource): void;

  // State accessors with accumulated type
  readonly $: TAccum;
  readonly state: TAccum;

  // Enhancer chaining
  with<TAdded>(
    enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded
  ): SignalTreeBuilder<TSource, TAccum> & TAdded;

  // From ISignalTree
  bind(thisArg?: unknown): (value?: TSource) => TSource | void;
  destroy(): void;

  /**
   * Add a layer of derived state.
   * Each layer can reference all previous layers.
   *
   * @param factory - Function that receives accumulated $ and returns derived definitions
   * @returns Builder with accumulated types for chaining
   */
  derived<TDerived extends object>(
    factory: ($: TAccum) => TDerived
  ): SignalTreeBuilder<TSource, TAccum & ProcessDerived<TDerived>>;
}
