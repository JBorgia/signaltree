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
  effect,
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

// One-time (per module load) advisory when `nativeErrors` is left unset —
// warns the default flips in v13 so callers can pin the shape they want now.
let warnedNativeErrorsDefault = false;

/**
 * Test-only: reset the one-time `nativeErrors` advisory flag. Exported from
 * the module (NOT the package barrel) so specs can exercise the first-call
 * behavior deterministically; the module-level flag is otherwise consumed by
 * whichever test runs first. Do not use in application code.
 * @internal
 */
export function __resetNativeErrorsAdvisoryForTests(): void {
  warnedNativeErrorsDefault = false;
}

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
  /**
   * Present only when the marker was built with `history()`. Records a
   * snapshot of the current values into the undo stack. We call it from an
   * effect so edits made THROUGH the bound FieldTree (which writes the model
   * signal directly, bypassing the marker's set/patch) are captured too.
   */
  __recordHistory?: () => void;
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
   * was announced (11.6.0) to flip in the next major, but v12 shipped with it
   * still `false` — the flip is now EXPLICITLY POSTPONED to v13 (an external
   * post-release audit caught the promise miss, 2026-07-24). If your code
   * depends on either error shape, set the option explicitly rather than
   * relying on the default — leaving it unset emits a one-time dev-mode
   * `console.info` advisory about the upcoming v13 flip.
   */
  nativeErrors?: boolean;
}

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
 * - **Single async authority, enforced structurally (v12).** The marker's own
 *   `asyncValidators`/`validateField()`/`validateAll()`/`submit()` path and the
 *   FieldTree's native Signal Forms `validateAsync`/`validateHttp` are two
 *   independent systems that this bridge does not connect — running both would
 *   leave `tree.$...field.valid()` and `fieldTree.field().valid()` disagreeing
 *   during any async validation window. So bridging a marker that carries
 *   `asyncValidators` **throws** ([ST2005]): pick ONE authority — declare async
 *   validation on the returned FieldTree via Signal Forms, or keep the marker's
 *   async path and don't bridge. (Sync validators are unified; only async is
 *   irreconcilable, because Signal Forms owns the field's `pending` state.)
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

  // Advisory (not a warning — the default is safe): nativeErrors is false in
  // 12.x and flips to true in v13. If the caller hasn't chosen, tell them once
  // so they can pin the shape now rather than be surprised by the v13 flip.
  // Explicitly setting either value silences it.
  if (
    options.nativeErrors === undefined &&
    !warnedNativeErrorsDefault &&
    (typeof ngDevMode === 'undefined' || ngDevMode)
  ) {
    warnedNativeErrorsDefault = true;
    console.info(
      '[SignalTree] signalForm(): `nativeErrors` defaults to false in 12.x ' +
        'and flips to true in v13. Set it explicitly to opt into branded ' +
        'Angular validation errors now, or pin the plain { kind, message } ' +
        'shape — either choice silences this notice.'
    );
  }

  // Single async authority, enforced structurally (v12). Async validation is
  // NOT unified between the marker and Signal Forms, and there is no way to run
  // both without a two-authorities disagreement window (`marker.valid()` vs
  // `fieldTree.field().valid()` diverging while one system's async validator is
  // pending). Rather than warn and let the ambiguous setup exist — or silently
  // disable the marker's async validators and drop validation the caller
  // configured — bridging a marker that carries asyncValidators fails closed:
  // the caller must pick ONE authority. Not dev-gated (a genuine
  // misconfiguration, not a footgun hint) and not swallowed (signalForm runs in
  // injection context, not the marker materializer). [ST2005]
  if (Object.keys(internals.__config?.asyncValidators ?? {}).length > 0) {
    throw new Error(
      '[SignalTree] signalForm(): this form() marker has asyncValidators ' +
        'configured, which cannot coexist with the Signal Forms bridge — the ' +
        "marker's async path and Signal Forms' validateAsync/validateHttp are " +
        'two independent authorities and would disagree during any async ' +
        'validation window. Pick ONE: (a) remove the async validators from the ' +
        'form() marker and declare them on the returned FieldTree via Signal ' +
        "Forms' validateAsync/validateHttp, or (b) keep the marker's async " +
        'path and do NOT bridge (drive the form through the marker\'s own ' +
        'validateField()/submit()). [ST2005]'
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

  // Undo/redo capture for FieldTree-origin edits. The marker's own
  // set/patch/reset already record into the history stack, but Angular Signal
  // Forms writes the model signal directly (bypassing those). This effect
  // observes the shared model and records on every change; snapshots that
  // duplicate the current present are deduped by the engine, so it composes
  // with the marker-side recording and with undo/redo (which set `present`
  // before restoring) without double-entries or feedback loops.
  if (internals.__recordHistory) {
    const record = internals.__recordHistory;
    runInInjectionContext(injector, () => {
      effect(() => {
        model(); // track every model change, whatever the write source
        record();
      });
    });
  }

  return fieldTree;
}
