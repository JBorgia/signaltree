/**
 * `form()` marker ↔ Angular Signal Forms interop.
 *
 * Turns a SignalTree `form()` marker into an Angular 22 Signal Forms
 * `FieldTree` that shares the marker's values signal as its model — one
 * source of truth, no copying, no sync loops. The marker's sync validators
 * are installed as Signal Forms validators (errors carry the validator's
 * semantic `kind` — `'required'`, `'email'`, … — or `'signalTree'` for
 * untagged custom validators; with `nativeErrors: true` built-ins emit
 * Angular's branded error classes), and the marker's own `errors()`/`valid()`
 * stay live when edits arrive through the FieldTree.
 *
 * **Requires Angular 22+** (`@angular/forms/signals`).
 *
 * @packageDocumentation
 */

import {
  inject,
  Injector,
  runInInjectionContext,
  type WritableSignal,
} from '@angular/core';
import {
  emailError,
  form,
  maxError,
  maxLengthError,
  minError,
  minLengthError,
  patternError,
  requiredError,
  validate,
  type FieldContext,
  type FieldTree,
  type ValidationError,
} from '@angular/forms/signals';
import type { FormSignal } from '@signaltree/core';

declare const ngDevMode: boolean | undefined;

/** Marker-side validator shape (see `Validator` in @signaltree/core). */
type MarkerValidator = ((
  value: unknown,
  formValues?: Record<string, unknown>
) => string | null) & {
  validatorKind?: string;
  validatorParams?: Record<string, unknown>;
};

interface FormMarkerInternals<T extends Record<string, unknown>> {
  __model?: WritableSignal<T>;
  __config?: {
    validators?: Partial<Record<string, MarkerValidator | MarkerValidator[]>>;
    asyncValidators?: Partial<Record<string, unknown>>;
  };
}

/** Options for the marker form of {@link signalForm}. */
export interface SignalFormOptions {
  /**
   * Injector to create the form and the marker-sync effect in. Optional when
   * called from an injection context (component field initializers,
   * constructors).
   */
  injector?: Injector;
  /**
   * When `true`, failures from built-in marker validators (`required`,
   * `email`, `min`, `max`, `minLength`, `maxLength`, `pattern`) are emitted
   * as Angular's BRANDED validation errors (`requiredError()`, `minError()`,
   * …) instead of plain `{ kind, message }` objects — so
   * `error instanceof NgValidationError` holds and constraint values are
   * available as typed properties (`.min`, `.maxLength`, `.pattern`, …).
   * Custom/untagged validators still emit
   * `{ kind: validatorKind ?? 'signalTree', message }` in both modes.
   *
   * Default `false` (plain objects — the pre-11.6 behavior). The default
   * flips in the next major.
   */
  nativeErrors?: boolean;
}

/**
 * @deprecated Renamed to {@link SignalFormOptions} in 11.6.0 (the
 * `signalForm()` naming unification). This alias will be removed in the next
 * major.
 */
export type MarkerSignalFormOptions = SignalFormOptions;

/**
 * Map a built-in validator failure to Angular's branded error factory.
 * Returns `null` when the kind is not a built-in (or a constraint-carrying
 * kind is missing its `validatorParams`, e.g. a custom validator that
 * self-tagged `'min'` via `withKind` without params) — callers fall back to
 * the plain `{ kind, message }` shape.
 */
function brandedError(
  validator: MarkerValidator,
  message: string
): ValidationError.WithoutFieldTree | null {
  const params = validator.validatorParams;
  switch (validator.validatorKind) {
    case 'required':
      return requiredError({ message });
    case 'email':
      return emailError({ message });
    case 'min':
      return typeof params?.['min'] === 'number'
        ? minError(params['min'], { message })
        : null;
    case 'max':
      return typeof params?.['max'] === 'number'
        ? maxError(params['max'], { message })
        : null;
    case 'minLength':
      return typeof params?.['minLength'] === 'number'
        ? minLengthError(params['minLength'], { message })
        : null;
    case 'maxLength':
      return typeof params?.['maxLength'] === 'number'
        ? maxLengthError(params['maxLength'], { message })
        : null;
    case 'pattern':
      return params?.['pattern'] instanceof RegExp
        ? patternError(params['pattern'], { message })
        : null;
    default:
      return null;
  }
}

/** One-time guard for the async-authority dev warning. */
let warnedAsyncAuthority = false;

/**
 * Implementation of the marker form of `signalForm()` (see
 * `./signal-form.ts` for the public entry and full JSDoc).
 *
 * - The FieldTree's model IS the marker's values signal — edits through
 *   either API are immediately visible to the other.
 * - The marker's sync validators run as Signal Forms validators; errors
 *   appear on field state as `{ kind, message }`. `kind` is the validator's
 *   `validatorKind` when it has one (all built-in `validators.*` set this:
 *   `'required'`, `'email'`, `'minLength'`, …; `validators.when` forwards
 *   the wrapped validator's kind); custom validators without a
 *   `validatorKind` fall back to the generic `'signalTree'`. With
 *   `{ nativeErrors: true }`, built-in validator failures are emitted as
 *   Angular's branded error classes instead (see
 *   {@link SignalFormOptions.nativeErrors}).
 * - The marker's `errors()`/`valid()` signals are computed over the shared
 *   model, so FieldTree-side writes are reflected immediately.
 * - **Async validators are NOT unified between the two systems.** The
 *   marker's own `asyncValidators`/`validateField()`/`validateAll()`/
 *   `submit()` path and the FieldTree's native Signal Forms `validateAsync`/
 *   `validateHttp` are two independent systems that this bridge does not
 *   connect — pick ONE as the authority for a given bridged form. Using both
 *   on the same field can leave `tree.$...field.valid()` and
 *   `fieldTree.field().valid()` disagreeing during an async validation
 *   window, since each only reflects its own validator set.
 *
 * @internal
 */
export function markerSignalFormImpl<T extends Record<string, unknown>>(
  formSignal: FormSignal<T>,
  options: SignalFormOptions = {}
): FieldTree<T> {
  const internals = formSignal as unknown as FormMarkerInternals<T>;
  const model = internals.__model;
  if (!model) {
    throw new Error(
      '[SignalTree] signalForm() needs a form() marker from ' +
        '@signaltree/core@>=11.5 (missing internal model signal).'
    );
  }

  const injector = options.injector ?? inject(Injector);
  const validatorConfig = internals.__config?.validators ?? {};
  const nativeErrors = options.nativeErrors ?? false;

  // Async validation is deliberately NOT unified (see the JSDoc above) —
  // warn once in dev when a bridged marker also has asyncValidators, since
  // that setup invites the two-authorities disagreement window.
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedAsyncAuthority &&
    Object.keys(internals.__config?.asyncValidators ?? {}).length > 0
  ) {
    warnedAsyncAuthority = true;
    console.warn(
      '[SignalTree] signalForm(): this form() marker has ' +
        'asyncValidators configured. Async validation is not unified ' +
        'between the marker and Signal Forms — pick one authority: the ' +
        "marker's validateField()/submit() path OR Signal Forms " +
        'validateAsync/validateHttp. Using both on one field can leave ' +
        "the marker's valid() and the FieldTree's valid() disagreeing " +
        'during an async validation window. See "Async validation is not ' +
        'unified between the two systems." in the @signaltree/ng-forms ' +
        'README.'
    );
  }

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
            if (message) {
              if (nativeErrors) {
                const branded = brandedError(validator, message);
                if (branded) return branded;
              }
              return { kind: validator.validatorKind ?? 'signalTree', message };
            }
          }
          return undefined;
        });
      }
    })
  );

  // No sync-back needed: the marker's errors()/valid() are computed over the
  // same model signal, so FieldTree-side edits are reflected immediately.
  return fieldTree;
}

/** One-time guard for the markerSignalForm deprecation warning. */
let warnedMarkerAliasDeprecated = false;

/**
 * Create an Angular Signal Forms `FieldTree` from a SignalTree `form()`
 * marker.
 *
 * @deprecated Renamed to `signalForm()` in 11.6.0 — same signature, same
 * behavior: `signalForm(tree.$.path.to.marker, options?)`. This alias will
 * be removed in the next major. Import `signalForm` from
 * `@signaltree/ng-forms/signals`.
 *
 * @public
 */
export function markerSignalForm<T extends Record<string, unknown>>(
  formSignal: FormSignal<T>,
  options: SignalFormOptions = {}
): FieldTree<T> {
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedMarkerAliasDeprecated
  ) {
    warnedMarkerAliasDeprecated = true;
    console.warn(
      '[SignalTree] markerSignalForm() is deprecated — renamed to ' +
        'signalForm() in 11.6.0 (same signature, same behavior). Import ' +
        "signalForm from '@signaltree/ng-forms/signals'. This alias will " +
        'be removed in the next major.'
    );
  }
  return markerSignalFormImpl(formSignal, options);
}
