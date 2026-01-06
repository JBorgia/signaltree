/**
 * Derived State Types for SignalTree
 *
 * Type definitions for the derived state system. The `.derived()` method
 * accepts computed() signals directly from @angular/core.
 *
 * @example
 * ```typescript
 * import { computed } from '@angular/core';
 *
 * const tree = signalTree({
 *   trucks: entityMap<TruckDto, number>(),
 *   selected: { truckId: null as number | null }
 * }, ($) => ({
 *   selected: {
 *     truck: computed(() => $.trucks.byId($.selected.truckId())?.())
 *   },
 *   canSubmit: computed(() => $.selected.truckId() !== null)
 * })).with(entities());
 * ```
 */

// =============================================================================
// INTERNAL SYMBOLS
// =============================================================================

const DERIVED_MARKER = Symbol.for('signaltree:derived');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Marker interface for derived state definitions.
 * Carries the factory function and return type.
 *
 * @deprecated This type is kept for backwards compatibility only.
 * Use `computed()` from @angular/core directly instead.
 */
export interface DerivedMarker<T> {
  readonly [DERIVED_MARKER]: true;
  readonly factory: () => T;
  /** Phantom type for inference - not used at runtime */
  readonly __type?: T;
}

/**
 * Extracts the return type from a derived marker.
 * @deprecated Use Signal<T> types directly instead.
 */
export type DerivedType<T> = T extends DerivedMarker<infer R> ? R : never;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if a value is a derived marker.
 * Used by mergeDerivedState for backwards compatibility.
 */
export function isDerivedMarker(
  value: unknown
): value is DerivedMarker<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    DERIVED_MARKER in value &&
    (value as Record<symbol, unknown>)[DERIVED_MARKER] === true
  );
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Get the derived marker symbol for internal use.
 * @internal
 */
export function getDerivedMarkerSymbol(): symbol {
  return DERIVED_MARKER;
}
