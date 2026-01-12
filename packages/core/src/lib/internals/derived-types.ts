import { Signal } from '@angular/core';

/**
 * Derived State Type Utilities
 *
 * Type definitions for the derived state system in SignalTree v7.
 */
import type { DerivedMarker } from '../markers/derived';
import type { TreeNode } from '../types';

// =============================================================================
// DERIVED STATE TYPES
// =============================================================================

/**
 * Converts a derived state definition into its signal representation.
 * - DerivedMarker<T> → Signal<T> (read-only computed signal)
 * - Signal<T> → Signal<T> (pass through unchanged)
 * - Objects → Recursive processing
 */
export type ProcessDerived<T> = T extends DerivedMarker<infer R>
  ? Signal<R>
  : T extends Signal<infer S>
  ? Signal<S>
  : T extends object
  ? { [P in keyof T]: ProcessDerived<T[P]> }
  : never;

/**
 * Deep merges source TreeNode and derived types.
 * Derived signals are merged into the source structure.
 *
 * Rules:
 * - Key in both: merge recursively if both are objects, otherwise derived wins
 * - Key only in source: preserve source type
 * - Key only in derived: add derived type
 */
export type DeepMergeTree<TSource, TDerived> = {
  [K in keyof TSource | keyof TDerived]: K extends keyof TSource
    ? K extends keyof TDerived
      ? // Key exists in both - merge recursively or derived overwrites
        TSource[K] extends object
        ? TDerived[K] extends object
          ? TDerived[K] extends DerivedMarker<infer R>
            ? Signal<R> // Derived marker overwrites source object
            : TSource[K] &
                DeepMergeTree<TSource[K], ProcessDerived<TDerived[K]>> // Merge objects
          : TSource[K] // Derived is non-object, keep source
        : ProcessDerived<TDerived[K]> // Source is primitive, derived overwrites
      : // Key only in source
        TSource[K]
    : // Key only in derived
    K extends keyof TDerived
    ? ProcessDerived<TDerived[K]>
    : never;
};

/**
 * Factory function type for derived state.
 * Receives the processed source state (TreeNode) and returns derived definitions.
 */
export type DerivedFactory<TSource, TDerived> = (
  $: TreeNode<TSource>
) => TDerived;

// =============================================================================
// EXTERNAL DERIVED UTILITIES
// =============================================================================

/**
 * Type utility to represent a tree after a derived tier has been applied.
 * Simplifies intermediate type definitions for external derived functions.
 *
 * When defining derived functions in separate files, you need intermediate types
 * to tell TypeScript what `$` contains at each tier. This utility reduces boilerplate.
 *
 * @typeParam TTree - The tree type before this derived tier
 * @typeParam TDerivedFn - The derived function type (typeof yourDerivedFn)
 *
 * @example
 * ```typescript
 * // Instead of manually writing:
 * type AppTreeWithTier1 = AppTreeBase & {
 *   $: AppTreeBase['$'] & ReturnType<typeof tier1Derived>;
 * };
 *
 * // Use WithDerived:
 * type AppTreeWithTier1 = WithDerived<AppTreeBase, typeof tier1Derived>;
 * type AppTreeWithTier2 = WithDerived<AppTreeWithTier1, typeof tier2Derived>;
 * ```
 */
export type WithDerived<
  TTree extends { $: object },
  TDerivedFn extends ($: TTree['$']) => object
> = TTree & {
  $: TTree['$'] & ReturnType<TDerivedFn>;
};

/**
 * Helper for defining derived tier functions in external files with proper typing.
 * This is a typed identity function - zero runtime overhead.
 *
 * When derived functions are in separate files, TypeScript cannot infer the `$`
 * parameter type from the call site. This helper provides the type context.
 *
 * The return type uses `($: any) => TReturn` intentionally. This allows the
 * `.derived()` method to properly infer the return type (TReturn) while still
 * providing full type checking for `$` inside the function body via TTree['$'].
 *
 * @typeParam TTree - The tree type that this derived tier expects
 * @param fn - The derived function that receives `$` and returns derived state
 * @returns The same function cast to accept any $ (for .derived() compatibility)
 *
 * @example
 * ```typescript
 * // In tier-entity-resolution.derived.ts
 * import { externalDerived } from '@signaltree/core';
 * import type { AppTreeBase } from '../app-tree';
 *
 * export const entityResolutionDerived = externalDerived<AppTreeBase>()($ => ({
 *   driver: {
 *     current: computed(() => {
 *       const id = $.selected.driverId();
 *       return id != null ? $.drivers.byId(id)?.() ?? null : null;
 *     })
 *   }
 * }));
 *
 * // In app-tree.ts - use with regular .derived()
 * signalTree({ ... })
 *   .derived(entityResolutionDerived)  // Works exactly as before
 * ```
 */
export function externalDerived<TTree extends { $: object }>(): <
  TReturn extends object
>(
  fn: ($: TTree['$']) => TReturn
) => ($: any) => TReturn {
  // Return a function that takes the actual derived function
  // This allows TTree to be specified explicitly while TReturn is inferred
  return <TReturn extends object>(fn: ($: TTree['$']) => TReturn) =>
    fn as ($: any) => TReturn;
}
