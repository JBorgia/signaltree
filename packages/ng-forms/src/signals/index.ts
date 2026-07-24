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
export { applySignalTreeSchemas } from './bridge';
export { type SignalFormOptions } from './marker-bridge';
