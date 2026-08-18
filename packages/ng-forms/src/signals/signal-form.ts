/**
 * `signalForm()` — the single entry point for producing an Angular Signal
 * Forms `FieldTree` from SignalTree state.
 *
 * One name, one source: a `form()` marker —
 * `signalForm(tree.$.path.to.marker, options?)`.
 *
 * There is deliberately NO SignalTree-side schema route. StandardSchema
 * validation is applied with Angular's own `schema` callback and Angular's own
 * `validateStandardSchema`; SignalTree publishes the model and nothing else.
 * See RELEASE-1.0.md, ANG-V0 / SCHEMA-DEL.
 *
 * **Requires Angular 22+** (`@angular/forms/signals`).
 *
 * @packageDocumentation
 */

import type { FieldTree } from '@angular/forms/signals';
import type { FormSignal } from '@signaltree/core';

import { markerSignalFormImpl, type SignalFormOptions } from './marker-bridge';

/**
 * Create an Angular Signal Forms `FieldTree` from a SignalTree `form()`
 * marker.
 *
 * The FieldTree's model IS the marker's values signal — one source of truth,
 * no copying, no sync loops. The marker's sync validators run as Signal
 * Forms validators (errors carry the validator's semantic `kind`, or
 * `'signalTree'` for untagged custom validators; with
 * `{ nativeErrors: true }` built-ins emit Angular's branded error classes),
 * and the marker's own `errors()`/`valid()` stay live when edits arrive
 * through the FieldTree.
 *
 * **Reach for this form when your form state lives in a `form()` marker**
 * (validators declared on the marker, `patch`/`reset`/`submit` through the
 * marker API).
 *
 * **Single async authority, enforced (v12)** — the marker's
 * `asyncValidators`/`validateField()`/`submit()` path and Signal Forms'
 * `validateAsync`/`validateHttp` are independent and cannot both drive one
 * bridged form. Bridging a marker that has `asyncValidators` configured
 * **throws** ([ST2005]); pick ONE authority — Signal Forms' `validateAsync`
 * on the returned FieldTree, or the marker's own path (unbridged). Sync
 * validators are fully unified.
 *
 * @example
 * ```ts
 * import { Component } from '@angular/core';
 * import { FormField } from '@angular/forms/signals';
 * import { signalTree, form, validators } from '@signaltree/core';
 * import { signalForm } from '@signaltree/ng-forms/signals';
 *
 * @Component({
 *   imports: [FormField],
 *   template: `
 *     <input [formField]="profile.name" />
 *     @if (profile.name().errors().length) { <span>…</span> }
 *   `,
 * })
 * class ProfileComponent {
 *   readonly tree = signalTree({
 *     onboarding: {
 *       profile: form<{ name: string; email: string }>({
 *         initial: { name: '', email: '' },
 *         validators: {
 *           name: validators.required('Required'),
 *           email: [validators.required('Required'), validators.email()],
 *         },
 *       }),
 *     },
 *   });
 *
 *   readonly profile = signalForm(this.tree.$.onboarding.profile);
 * }
 * ```
 *
 * @param marker - A `form()` marker accessor (`tree.$.path.to.marker`).
 * @param options - Injector and error-shape options
 *   ({@link SignalFormOptions}).
 *
 * @public
 */
export function signalForm<T extends Record<string, unknown>>(
  marker: FormSignal<T>,
  options?: SignalFormOptions<T>
): FieldTree<T> {
  return markerSignalFormImpl(marker, options);
}
