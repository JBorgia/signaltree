/**
 * SignalTree Markers
 *
 * Marker functions define special state types that are processed
 * during tree creation or by enhancers.
 */

// Derived state types (derived() function removed - use computed() directly)
export {
  isDerivedMarker,
  getDerivedMarkerSymbol,
  type DerivedMarker,
  type DerivedType,
} from './derived';
