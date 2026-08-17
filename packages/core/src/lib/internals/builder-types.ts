/**
 * SignalTree Builder Types
 *
 * Type definitions for the SignalTreeBuilder used in v7.
 */
import type { Signal } from '@angular/core';

import type { ProcessDerived } from './derived-types';
import type { Enhancer, ISignalTree, NodeAccessor, TreeNode } from '../types';

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
  with<TAdded>(enhancer: Enhancer<TAdded>): this & TAdded;
  /** Realization-facing overload — see ISignalTree.with. */
  with<TAdded>(
    enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded
  ): this & TAdded;

  // From ISignalTree
  /**
   * Returns the tree callable bound to `thisArg` — a `NodeAccessor<TSource>`,
   * i.e. all three call forms, with the read form returning `TSource`.
   *
   * This was declared `(value?: TSource) => TSource | void`, which collapsed
   * the three overloads into one lossy signature and made the read form return
   * `TSource | void`. The runtime never behaved that way: `signal-tree.ts`
   * defines `bind` as returning a `NodeAccessor<T>`, and the builder copies
   * that function verbatim. So the declaration under-promised what the runtime
   * already delivered — the same runtime-present / type-missing drift recorded
   * above for `destroyed`, `registerCleanup` and `updateAndReport`.
   *
   * It also had a consumer-visible consequence beyond `bind` itself: because
   * `SignalTree<T>` requires `ISignalTree<T>`'s `bind(): NodeAccessor<T>`, the
   * lossy signature made `const tree: SignalTree<S> = signalTree(...)` fail to
   * compile. Gated by `signal-tree-type-matrix.typing.spec.ts` section C.
   */
  bind(thisArg?: unknown): NodeAccessor<TSource>;
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

  // `batchUpdate` was REMOVED in 14.1.1 — a duplicate of the tree callable.
  // Use `tree(partial)`, or `tree.batch(() => tree(partial))` to batch notifications.

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

export interface SignalTreePlanBuilder<
  TSource extends object,
  TAdded extends object = object,
> {
  with<TNextAdded>(
    enhancer: Enhancer<TNextAdded>
  ): SignalTreePlanBuilder<TSource, TAdded & TNextAdded>;
  /** Realization-facing overload — see ISignalTree.with. */
  with<TNextAdded>(
    enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TNextAdded
  ): SignalTreePlanBuilder<TSource, TAdded & TNextAdded>;

  build(): ISignalTree<TSource> & TAdded;
}
