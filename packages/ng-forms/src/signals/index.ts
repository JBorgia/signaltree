/**
 * `@signaltree/ng-forms/signals` — Angular Signal Forms bridge for SignalTree.
 *
 * Requires Angular 22+ (`@angular/forms` ships Signal Forms in v22.0.0).
 *
 * Apps on Angular 20/21 can use `@signaltree/schema` directly via
 * `tree.schemas.errorsAt(path)` without this subpath.
 *
 * @packageDocumentation
 */

export { signalForm } from './signal-form';
export { signalFormBridge, applySignalTreeSchemas } from './bridge';
export {
  markerSignalForm,
  type SignalFormOptions,
  type MarkerSignalFormOptions,
} from './marker-bridge';
