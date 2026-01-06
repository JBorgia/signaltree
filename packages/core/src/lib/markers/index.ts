/**
 * SignalTree Markers
 *
 * Marker functions define special state types that are processed
 * during tree creation or by enhancers.
 */

// Derived state marker
export {
  derived,
  isDerivedMarker,
  getDerivedMarkerSymbol,
  type DerivedMarker,
  type DerivedType,
} from './derived';
