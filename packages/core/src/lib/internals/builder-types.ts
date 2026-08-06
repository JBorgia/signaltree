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
 * import { computed } from '@angular/core';
 * import { signalTree } from '@signaltree/core';
 *
 * const tree = signalTree({ count: 0 })
 *   .derived(($) => ({
 *     doubled: computed(() => $.count() * 2)
 *   }))
 *   .derived(($) => ({
 *     quadrupled: computed(() => $.doubled() * 2)  // ✓ $.doubled is typed
 *   }));
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

  /**
   * Enhancer chaining. Returns `this & TAdded` so each enhancer's surface
   * ACCUMULATES across the chain.
   *
   * This used to return `SignalTreeBuilder<TSource, TAccum> & TAdded`, which
   * discarded everything added before it — so
   *
   *     signalTree({}).with(timeTravel()).with(serialization()).with(batching())
   *
   * typed as `SignalTreeBuilder<…> & BatchingMethods` and lost `canUndo` and
   * `serialize` entirely. Every method existed at RUNTIME; only the type forgot
   * them, so the workaround was a cast, and the demo's time-travel page carries
   * exactly that cast.
   *
   * `batching.types.ts` has asserted "`.with()` preserves accumulated types via
   * the `this & TAdded` pattern" the whole time. The comment described the
   * intent; the signature did not implement it. Fixed in 14.0.0 — polymorphic
   * `this` is what makes the intersection survive the next link.
   */
  with<TAdded>(
    enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded
  ): this & TAdded;

  // From ISignalTree
  bind(thisArg?: unknown): (value?: TSource) => TSource | void;
  destroy(): void;
  /**
   * Whether this tree has been destroyed. Present at runtime on every
   * `signalTree()` return (copied from the ISignalTree lifecycle in
   * signal-tree.ts) but was missing from this builder type — the docs
   * correctly taught it while `signalTree({...}).destroyed` failed to
   * compile (M3 acceptance test, run 2, 2026-07-23).
   */
  readonly destroyed: Signal<boolean>;
  /**
   * Register a cleanup function called on tree destroy. Same runtime-present
   * but type-missing gap as `destroyed` — see note above.
   */
  registerCleanup(fn: () => void): void;

  /**
   * Apply a partial update and return the dot-paths of leaf signals that
   * actually changed. See {@link ISignalTree.updateAndReport}.
   *
   * Same runtime-present-but-type-missing gap as `destroyed` above:
   * `signalTree({...}).updateAndReport(payload)` worked at runtime (the
   * builder forwards it) but failed to compile. Caught by the skills doc
   * linter in 13.5.0, while documenting it as the replacement for the
   * deprecated `@signaltree/enterprise` — so the entire recommended
   * migration target did not typecheck.
   */
  updateAndReport(
    updates: Partial<TSource> | ((current: TSource) => Partial<TSource>)
  ): string[];

  /**
   * Apply a partial update in a single batch. Same forwarded-but-untyped gap
   * as `updateAndReport`.
   */
  batchUpdate(
    updates: Partial<TSource> | ((current: TSource) => Partial<TSource>)
  ): void;

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
