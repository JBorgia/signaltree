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
