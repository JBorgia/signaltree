/**
 * `form()` marker ↔ Angular Signal Forms interop.
 *
 * Turns a SignalTree `form()` marker into an Angular 22 Signal Forms
 * `FieldTree` that shares the marker's values signal as its model — one
 * source of truth, no copying, no sync loops. The marker's sync validators
 * are installed as Signal Forms validators (errors surface with
 * `kind: 'signalTree'`), and the marker's own `errors()`/`valid()` stay live
 * when edits arrive through the FieldTree.
 *
 * **Requires Angular 22+** (`@angular/forms/signals`).
 *
 * @packageDocumentation
 */

import {
  effect,
  inject,
  Injector,
  runInInjectionContext,
  type WritableSignal,
} from '@angular/core';
import {
  form,
  validate,
  type FieldContext,
  type FieldTree,
} from '@angular/forms/signals';
import type { FormSignal } from '@signaltree/core';

/** Marker-side validator shape (see `Validator` in @signaltree/core). */
type MarkerValidator = (
  value: unknown,
  formValues?: Record<string, unknown>
) => string | null;

interface FormMarkerInternals<T extends Record<string, unknown>> {
  __model?: WritableSignal<T>;
  __validateSync?: (fields?: Array<keyof T>) => void;
  __config?: {
    validators?: Partial<Record<string, MarkerValidator | MarkerValidator[]>>;
  };
}

/** Options for {@link markerSignalForm}. */
export interface MarkerSignalFormOptions {
  /**
   * Injector to create the form and the marker-sync effect in. Optional when
   * called from an injection context (component field initializers,
   * constructors).
   */
  injector?: Injector;
}

/**
 * Create an Angular Signal Forms `FieldTree` from a SignalTree `form()`
 * marker.
 *
 * - The FieldTree's model IS the marker's values signal — edits through
 *   either API are immediately visible to the other.
 * - The marker's sync validators run as Signal Forms validators; errors
 *   appear on field state as `{ kind: 'signalTree', message }`.
 * - The marker's `errors()`/`valid()` signals stay live for FieldTree-side
 *   writes (a small effect re-runs the marker's sync validation on model
 *   changes).
 * - Async marker validators are NOT auto-installed; run them via the
 *   marker's `validate()`/`submit()`, or register Signal Forms
 *   `validateAsync`/`validateHttp` rules yourself.
 *
 * @example
 * ```ts
 * import { Component } from '@angular/core';
 * import { FormField } from '@angular/forms/signals';
 * import { signalTree, form, validators } from '@signaltree/core';
 * import { markerSignalForm } from '@signaltree/ng-forms/signals';
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
 *   readonly profile = markerSignalForm(this.tree.$.onboarding.profile);
 * }
 * ```
 *
 * @public
 */
export function markerSignalForm<T extends Record<string, unknown>>(
  formSignal: FormSignal<T>,
  options: MarkerSignalFormOptions = {}
): FieldTree<T> {
  const internals = formSignal as unknown as FormMarkerInternals<T>;
  const model = internals.__model;
  if (!model) {
    throw new Error(
      '[SignalTree] markerSignalForm() needs a form() marker from ' +
        '@signaltree/core@>=11.5 (missing internal model signal).'
    );
  }

  const injector = options.injector ?? inject(Injector);
  const validatorConfig = internals.__config?.validators ?? {};

  const fieldTree = runInInjectionContext(injector, () =>
    form<T>(model, (root) => {
      for (const [field, fieldValidators] of Object.entries(validatorConfig)) {
        if (!fieldValidators) continue;
        const list = Array.isArray(fieldValidators)
          ? fieldValidators
          : [fieldValidators];
        const path = (root as Record<string, unknown>)[field];
        if (!path) continue;

        validate(path as never, (ctx: FieldContext<unknown>) => {
          // Reading model() (not just ctx.value()) makes this reactive to
          // the whole form, so cross-field rules (validators.when) re-run
          // when sibling fields change.
          const formValues = model() as Record<string, unknown>;
          for (const validator of list) {
            const message = validator(ctx.value(), formValues);
            if (message) return { kind: 'signalTree', message };
          }
          return undefined;
        });
      }
    })
  );

  // FieldTree edits write to the raw model signal, bypassing the marker's
  // validate-on-write wrappers — re-run sync validation so the marker's own
  // errors()/valid() stay truthful for non-Signal-Forms consumers.
  if (internals.__validateSync) {
    runInInjectionContext(injector, () =>
      effect(() => {
        model();
        internals.__validateSync?.();
      })
    );
  }

  return fieldTree;
}
