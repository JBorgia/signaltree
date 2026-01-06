/**
 * Derived State Marker for SignalTree
 *
 * Enables type-safe computed signals that can be nested alongside source state.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   trucks: entityMap<TruckDto, number>(),
 *   selected: { truckId: null as number | null }
 * }, ($) => ({
 *   selected: {
 *     truck: derived(() => $.trucks.byId($.selected.truckId())?.())
 *   },
 *   canSubmit: derived(() => $.selected.truckId() !== null)
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
 */
export interface DerivedMarker<T> {
  readonly [DERIVED_MARKER]: true;
  readonly factory: () => T;
  /** Phantom type for inference - not used at runtime */
  readonly __type?: T;
}

/**
 * Extracts the return type from a derived marker.
 */
export type DerivedType<T> = T extends DerivedMarker<infer R> ? R : never;

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a derived state marker.
 *
 * Use this to define computed values that depend on source state.
 * The factory function is called within a `computed()` context,
 * so signal reads are automatically tracked.
 *
 * @param factory - Function that computes the derived value.
 *                  Called within a computed() context, so signal
 *                  reads are automatically tracked.
 * @returns A marker that will be processed into a computed signal.
 *
 * @example Basic usage
 * ```typescript
 * signalTree({
 *   count: 0
 * }, ($) => ({
 *   doubled: derived(() => $.count() * 2)
 * }))
 * ```
 *
 * @example Nested derived state
 * ```typescript
 * signalTree({
 *   selected: { truckId: null as number | null },
 *   trucks: entityMap<TruckDto, number>()
 * }, ($) => ({
 *   selected: {
 *     // Merges with source's selected object
 *     truck: derived(() => {
 *       const id = $.selected.truckId();
 *       return id != null ? $.trucks.byId(id)?.() ?? null : null;
 *     })
 *   }
 * })).with(entities());
 * ```
 *
 * @example Cross-domain derived
 * ```typescript
 * signalTree({
 *   tickets: { active: null as TicketDto | null },
 *   selected: { truckId: null as number | null }
 * }, ($) => ({
 *   canSubmit: derived(() =>
 *     $.tickets.active() !== null && $.selected.truckId() !== null
 *   )
 * }))
 * ```
 */
export function derived<T>(factory: () => T): DerivedMarker<T> {
  return {
    [DERIVED_MARKER]: true,
    factory,
  };
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if a value is a derived marker.
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
