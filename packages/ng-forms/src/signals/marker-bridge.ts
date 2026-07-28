/**
 * `form()` marker ↔ Angular Signal Forms interop.
 *
 * Turns a SignalTree `form()` marker into an Angular 22 Signal Forms
 * `FieldTree` that shares the marker's values signal as its model — one
 * source of truth, no copying, no sync loops. The marker's sync validators
 * are installed as Signal Forms validators (built-in validator failures emit
 * Angular's branded error classes by default since v14; `nativeErrors: false`
 * restores the plain `{ kind, message }` shape, where `kind` is the validator's
 * semantic kind — `'required'`, `'email'`, … — or `'signalTree'` for untagged
 * custom validators), and the marker's own `errors()`/`valid()` stay live when
 * edits arrive through the FieldTree.
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
  apply,
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
  type FormOptions,
  type SchemaOrSchemaFn,
  type ValidationError,
} from '@angular/forms/signals';
import type { FormSignal } from '@signaltree/core';

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
export interface SignalFormOptions<
  T extends Record<string, unknown> = Record<string, unknown>
> extends Pick<
    FormOptions<T>,
    'name' | 'submission' | 'experimentalWebMcpTool'
  > {
  /**
   * Injector to create the form and the marker-sync effect in. Optional when
   * called from an injection context (component field initializers,
   * constructors).
   */
  injector?: Injector;
  /**
   * An Angular Signal Forms schema — either a `SchemaFn` (`(path) => {…}`) or a
   * cached `Schema` object from `schema()` — applied to the returned
   * `FieldTree` on top of any per-field validators the `form()` marker
   * carries. Reach for this when your form's rules — `disabled`/`hidden`/
   * `metadata`/`applyEach`/cross-field `validate`/`validateAsync` — live in a
   * Signal Forms schema rather than on the marker: the marker stays the single
   * source of truth for the MODEL (and drives `history()` undo/redo), while the
   * schema owns the field RULES. The two compose in one `form()` call (via
   * `apply()`), so there is no second model or sync loop. Marker validators (if
   * any) run first, then this schema — keep validation in exactly one place to
   * avoid duplicate errors.
   */
  schema?: SchemaOrSchemaFn<T>;
  /**
   * `name`, `submission`, and `experimentalWebMcpTool` are forwarded verbatim
   * to Angular's `form(model, schema, options)` (inherited above) — including
   * WebMCP, which exposes the form as a tool to AI agents
   * (`provideExperimentalWebMcpForms` + `experimentalWebMcpTool`).
   */
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
   * **Default `true` since v14** — the flip announced in 11.6.0 and deferred
   * through 12.x and 13.x. Branded errors are the Angular-native shape, so
   * they are the default a fresh caller (human or agent) should get.
   *
   * Set `nativeErrors: false` to keep the pre-v14 plain `{ kind, message }`
   * objects. `kind` and `message` are present in BOTH shapes, so code reading
   * only those two keeps working; narrowing on the plain object shape,
   * serializing errors, or deep-equalling them in tests is what needs updating
   * (see `docs/guides/migration-v13-v14.md`).
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
 * - The marker's sync validators run as Signal Forms validators. Since v14,
 *   built-in validator failures are emitted as Angular's branded error classes
 *   (`requiredError()`, `minError()`, …) by default. With
 *   `{ nativeErrors: false }` they appear as plain `{ kind, message }` instead,
 *   where `kind` is the validator's `validatorKind` when it has one (all
 *   built-in `validators.*` set this: `'required'`, `'email'`, `'minLength'`, …;
 *   `validators.when` forwards the wrapped validator's kind). Custom validators
 *   without a `validatorKind` always emit
 *   `{ kind: 'signalTree', message }` — both modes (see
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
  options: SignalFormOptions<T> = {}
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
  // v14: branded Angular errors are the default. Pass `nativeErrors: false`
  // for the pre-v14 plain `{ kind, message }` shape.
  const nativeErrors = options.nativeErrors ?? true;

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
    form<T>(
      model,
      (root) => {
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
                return {
                  kind: validator.validatorKind ?? 'signalTree',
                  message,
                };
              }
            }
            return undefined;
          });
        }

        // Caller-supplied Angular Signal Forms schema — a SchemaFn OR a cached
        // Schema object. apply() accepts both and composes it into the same
        // form() call as the marker validators above, over the shared model.
        if (options.schema) {
          // Casts bypass apply()'s SchemaPath<TValue> inference (root is the
          // genuine root path, options.schema the genuine schema for T); types
          // are erased at runtime.
          apply(root as never, options.schema as never);
        }
      },
      // Forward Angular FormOptions verbatim (name/submission/WebMCP).
      {
        injector,
        name: options.name,
        submission: options.submission,
        experimentalWebMcpTool: options.experimentalWebMcpTool,
      }
    )
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
