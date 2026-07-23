/**
 * `signalForm()` — the single entry point for producing an Angular Signal
 * Forms `FieldTree` from SignalTree state.
 *
 * One name, two sources (11.6.0 naming unification — previously
 * `markerSignalForm` and `signalFormBridge`, both kept as deprecated
 * aliases for one minor):
 *
 * - **`form()` marker** — `signalForm(tree.$.path.to.marker, options?)`
 * - **schema registry** — `signalForm<TModel>(tree, rootPath, subtree)`
 *
 * **Requires Angular 22+** (`@angular/forms/signals`).
 *
 * @packageDocumentation
 */

import type { FieldTree } from '@angular/forms/signals';
import type { FormSignal } from '@signaltree/core';
import type { SchemaMethods } from '@signaltree/schema';

import { signalFormBridgeImpl } from './bridge';
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
 * **Async validators are NOT unified between the two systems** — the
 * marker's `asyncValidators`/`validateField()`/`submit()` path and Signal
 * Forms' `validateAsync`/`validateHttp` are independent; pick ONE as the
 * authority for a given bridged form (a one-time dev warning fires when a
 * bridged marker has `asyncValidators` configured).
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
  options?: SignalFormOptions
): FieldTree<T>;
/**
 * Create an Angular Signal Forms `FieldTree` bound to a SignalTree subtree
 * with every schema registered via `@signaltree/schema` auto-applied
 * (`validateStandardSchema` per bound leaf path under `rootPath`).
 *
 * Reads from the tree's schema registry — no schema arguments needed. The
 * `SchemaMethods` constraint on `tree` enforces single-source-of-truth at
 * the type level: `schemas()` must be applied before `signalForm()`.
 *
 * **Reach for this form when your validation lives in StandardSchema
 * schemas** (Zod/Valibot/ArkType) registered with the `schemas()` enhancer,
 * rather than in a `form()` marker.
 *
 * @example
 * ```ts
 * import { signalTree } from '@signaltree/core';
 * import { schemas } from '@signaltree/schema';
 * import { signalForm } from '@signaltree/ng-forms/signals';
 * import { z } from 'zod';
 *
 * const tree = signalTree({ user: { name: '', email: '' } }).with(
 *   schemas({
 *     schemas: {
 *       'user.name': z.string().min(2),
 *       'user.email': z.string().email(),
 *     },
 *   }),
 * );
 *
 * const userForm = signalForm<User>(tree, 'user', tree.$.user);
 * // userForm is a FieldTree<User> with validation auto-wired.
 * ```
 *
 * @param tree - A SignalTree carrying `SchemaMethods` (i.e. after
 *   `.with(schemas(...))`).
 * @param rootPath - Dotted path of the subtree the form is rooted at.
 * @param subtree - The matching node accessor (`tree.$.<rootPath>`).
 *
 * @public
 */
export function signalForm<TModel>(
  tree: SchemaMethods,
  rootPath: string,
  subtree: unknown
): FieldTree<TModel>;
export function signalForm<T extends Record<string, unknown>, TModel>(
  source: FormSignal<T> | SchemaMethods,
  optionsOrRootPath?: SignalFormOptions | string,
  subtree?: unknown
): FieldTree<T> | FieldTree<TModel> {
  // Overload discrimination: the schema form is the only one whose second
  // argument is a string (rootPath); the marker form takes an options object
  // or nothing. The first arguments are structurally disjoint too (a form()
  // marker is callable with patch/reset/submit and has no `schemas`; a
  // schema tree carries the `schemas` methods object), so the string check
  // is unambiguous.
  if (typeof optionsOrRootPath === 'string') {
    return signalFormBridgeImpl<TModel>(
      source as SchemaMethods,
      optionsOrRootPath,
      subtree
    );
  }
  return markerSignalFormImpl(source as FormSignal<T>, optionsOrRootPath);
}
