import type { HistoryFeature } from '../types';

/**
 * `form()` — the FRAMEWORK-NEUTRAL half: identity, validator signatures, wizard
 * and form configuration, the descriptor shape, and the type guard.
 *
 * Fourth split. `form` is the largest and most Angular-dense marker — 15 of its
 * primitives sit in `createFormSignal` — but the seam is the same one, because
 * all of that density is realization.
 *
 * `HistoryFeature` is imported TYPE-ONLY from `../types`. That file writes its
 * Angular import in value form, so a value import here would drag a framework
 * into the closure; the type-only form is erased. `check-contract-neutrality.mjs`
 * proves that rather than assuming it.
 *
 * Staying in `form.ts`: `FormSignal`, `FormFields`, `FormWizard` (realized types
 * expressed in `Signal`), `form()` (its lazy builtin registration names
 * `createFormSignal`), `createFormSignal`, and the `validators` helpers —
 * Angular-neutral, but ordinary-user API the authoring SDK does not need.
 */

export const FORM_MARKER = Symbol('FORM_MARKER');

/**
 * Validator function returns error message or null if valid.
 *
 * Receives the current form values as an optional second argument so
 * cross-field validators (e.g. `validators.when`) can inspect sibling fields.
 *
 * The optional `validatorKind` property is a semantic identifier ('required',
 * 'email', …) that bridges — like `signalForm()` — can use as the
 * Signal Forms error `kind` instead of a generic bridge-source literal. Every
 * built-in `validators.*` factory tags its returned closure with this, and
 * `validators.when` forwards the wrapped validator's kind; custom validators
 * may set it too (see {@link withKind}), or leave it unset to fall back to
 * the bridge's generic kind.
 *
 * `validatorParams` is internal: built-in factories with a constraint value
 * (`min`, `max`, `minLength`, `maxLength`, `pattern`) record it here so
 * bridges can construct Angular's branded validation errors (e.g.
 * `minError(min, { message })`), which carry the constraint as a typed
 * property.
 */
export type Validator<T> = ((
  value: T,
  formValues?: Record<string, unknown>
) => string | null) & {
  validatorKind?: string;
  /** @internal — constraint values for branded-error bridges. */
  validatorParams?: Record<string, unknown>;
};

/**
 * Async validator function
 */
export type AsyncValidator<T> = (value: T) => Promise<string | null>;

/**
 * Wizard step configuration
 */
export interface WizardStepConfig {
  /** Fields visible/editable in this step */
  fields?: string[];
  /** Validation function for step (must pass to proceed) */
  validate?: () => Promise<boolean> | boolean;
  /** Whether step can be skipped */
  canSkip?: boolean;
}

/**
 * Wizard configuration
 */
export interface WizardConfig {
  /** Step names in order */
  steps: string[];
  /** Per-step configuration */
  stepConfig?: Record<string, WizardStepConfig>;
  /** Fields required per step (alternative to stepConfig) */
  stepFields?: Record<string, string[]>;
}

/**
 * Form marker configuration
 */
export interface FormConfig<T extends Record<string, unknown>> {
  /** Initial form values */
  initial: T;
  /** LocalStorage key for persistence (optional) */
  persist?: string;
  /** Custom storage backend (default: localStorage) */
  storage?: Storage | null;
  /** Debounce delay for persistence writes (default: 500ms) */
  persistDebounceMs?: number;
  /** Per-field validators */
  validators?: Partial<
    Record<keyof T, Validator<unknown> | Validator<unknown>[]>
  >;
  /** Per-field async validators */
  asyncValidators?: Partial<Record<keyof T, AsyncValidator<unknown>>>;
  /** Wizard configuration (optional) */
  wizard?: WizardConfig;
  /** Custom equality check for dirty detection */
  equalityFn?: (a: unknown, b: unknown) => boolean;
  /**
   * Undo/redo history, built by the `history()` helper:
   * `form({ history: history({ capacity, exclude }) })`. Attaches to the
   * marker's values signal, so undo/redo also drive a bound `signalForm()`
   * field tree. Tree-shaken out when `history()` is never imported.
   */
  history?: HistoryFeature<T>;
}

/**
 * Form marker - placeholder in source state
 */
export interface FormMarker<T extends Record<string, unknown>> {
  [FORM_MARKER]: true;
  config: FormConfig<T>;
}

/**
 * Type guard to check if a value is a form marker.
 */
export function isFormMarker(
  value: unknown
): value is FormMarker<Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === 'object' &&
    FORM_MARKER in value &&
    (value as Record<symbol, unknown>)[FORM_MARKER] === true
  );
}
