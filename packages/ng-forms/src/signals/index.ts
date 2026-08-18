/**
 * `@signaltree/ng-forms/signals` — Angular Signal Forms bridge for SignalTree.
 *
 * Requires Angular 22+ (`@angular/forms` ships Signal Forms in v22.0.0).
 *
 * Validation is Angular's: declare it with the `schema` callback and
 * `validateStandardSchema` from `@angular/forms/signals`, against the schemas
 * your application already owns. SignalTree publishes the model.
 *
 * @packageDocumentation
 */

export { signalForm } from './signal-form';
export { type SignalFormOptions } from './marker-bridge';
