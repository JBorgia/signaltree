import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

/**
 * Form Marker - Tree-integrated forms with validation, wizard, and persistence
 *
 * Creates a form that lives inside the SignalTree, inheriting batching,
 * DevTools visibility, and other enhancers automatically.
 *
 * @example
 * ```typescript
 * signalTree({
 *   listings: {
 *     entities: entityMap<Listing>(),
 *     createForm: form<ListingDraft>({
 *       initial: { title: '', price: null, photos: [] },
 *       persist: 'listing-draft',
 *       validators: {
 *         title: validators.required('Title required'),
 *       },
 *       wizard: {
 *         steps: ['details', 'photos', 'pricing', 'review'],
 *       }
 *     })
 *   }
 * })
 *
 * // Access: tree.$.listings.createForm.title()
 * // Validation: tree.$.listings.createForm.valid()
 * // Wizard: tree.$.listings.createForm.wizard.next()
 * ```
 */

// =============================================================================
// SYMBOL
// =============================================================================

export const FORM_MARKER = Symbol('FORM_MARKER');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Validator function returns error message or null if valid.
 *
 * Receives the current form values as an optional second argument so
 * cross-field validators (e.g. `validators.when`) can inspect sibling fields.
 *
 * The optional `validatorKind` property is a semantic identifier ('required',
 * 'email', …) that bridges — like `markerSignalForm()` — can use as the
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
}

/**
 * Form marker - placeholder in source state
 */
export interface FormMarker<T extends Record<string, unknown>> {
  [FORM_MARKER]: true;
  config: FormConfig<T>;
}

/**
 * Wizard navigation interface
 */
export interface FormWizard {
  /** Current step index (0-based) */
  currentStep: Signal<number>;
  /** Current step name */
  stepName: Signal<string>;
  /** All step names */
  steps: Signal<string[]>;
  /** Can navigate forward */
  canNext: Signal<boolean>;
  /** Can navigate back */
  canPrev: Signal<boolean>;
  /** Is on last step */
  isLastStep: Signal<boolean>;
  /** Is on first step */
  isFirstStep: Signal<boolean>;
  /** Navigate to next step (validates current step first) */
  next(): Promise<boolean>;
  /** Navigate to previous step */
  prev(): void;
  /** Jump to specific step by index or name */
  goTo(step: number | string): Promise<boolean>;
  /** Reset to first step */
  reset(): void;
}

/**
 * Deep signal access type - creates nested signals for each field
 */
export type FormFields<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? FormFields<T[K]> & {
        (): T[K];
        set(value: T[K]): void;
      }
    : {
        (): T[K];
        set(value: T[K]): void;
        update(fn: (current: T[K]) => T[K]): void;
      };
};

/**
 * Materialized form signal with full API
 */
export interface FormSignal<T extends Record<string, unknown>> {
  /** Deep signal access to all fields */
  $: FormFields<T>;

  /** Get all current values */
  (): T;

  /**
   * v10.4 alias — returns the current form values, identical to calling
   * the marker itself. Added because AI coding agents trained on form-state
   * vocabularies (FormGroup, Formik, react-hook-form) consistently reach for
   * `.data()` to read form values rather than calling the marker directly.
   * Both forms work; calling the marker (`form()`) is preferred in new code
   * for consistency with other markers (`status()`, `entityMap()`).
   */
  data(): T;

  /** Set all values at once */
  set(values: Partial<T>): void;

  /** Patch specific fields */
  patch(values: Partial<T>): void;

  /** Reset to initial values */
  reset(): void;

  /** Clear to empty values */
  clear(): void;

  // Validation signals
  /**
   * Whether all fields are valid.
   *
   * `errors` (and therefore `valid`) is COMPUTED from the current values —
   * sync validators re-run reactively on any change through any API, so an
   * empty form with `required` validators reports invalid immediately and
   * cross-field rules re-evaluate when siblings change. Async validators
   * run via `validate()`/`validateField()`/`submit()`; their results merge
   * in while the checked value is unchanged (they self-invalidate on edit).
   */
  valid: Signal<boolean>;
  /** Whether any field has been modified */
  dirty: Signal<boolean>;
  /** Whether form is currently submitting */
  submitting: Signal<boolean>;
  /** Per-field touched state */
  touched: Signal<Record<keyof T, boolean>>;
  /** Per-field error messages */
  errors: Signal<Partial<Record<keyof T, string | null>>>;
  /** All error messages as array */
  errorList: Signal<string[]>;

  // Validation methods
  /** Validate all fields */
  validate(): Promise<boolean>;
  /** Validate specific field */
  validateField(field: keyof T): Promise<boolean>;
  /** Mark field as touched */
  touch(field: keyof T): void;
  /** Mark all fields as touched */
  touchAll(): void;

  // Submit handler
  /** Submit with handler (sets submitting, validates, calls handler) */
  submit<R>(handler: (values: T) => Promise<R>): Promise<R | null>;

  // Wizard (only present if wizard config provided)
  wizard?: FormWizard;

  // Persistence
  /** Force save to storage */
  persistNow(): void;
  /** Force reload from storage */
  reload(): void;
  /** Clear from storage */
  clearStorage(): void;
}

// =============================================================================
// MARKER FACTORY (Self-registering for tree-shaking)
// =============================================================================

/** @internal - Tracks if processor is registered */
let formRegistered = false;

/**
 * Creates a form marker for tree-integrated forms.
 *
 * Automatically registers its processor on first use - no manual
 * registration required. If you never use `form()`, the processor
 * is tree-shaken out of your bundle.
 *
 * @param config - Form configuration
 * @returns FormMarker to be processed during tree finalization
 *
 * @example
 * ```typescript
 * signalTree({
 *   profile: {
 *     editForm: form<ProfileEditForm>({
 *       initial: { displayName: '', bio: '' },
 *       validators: {
 *         displayName: validators.required(),
 *       }
 *     })
 *   }
 * })
 * ```
 */
export function form<T extends Record<string, unknown>>(
  config: FormConfig<T>
): FormMarker<T> {
  // Self-register on first use (tree-shakeable)
  if (!formRegistered) {
    formRegistered = true;
    registerBuiltinMarkerProcessor(isFormMarker, createFormSignal);
  }

  return {
    [FORM_MARKER]: true,
    config,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

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

// =============================================================================
// SIGNAL FACTORY
// =============================================================================

/**
 * Creates a materialized FormSignal from a FormMarker.
 * @internal
 */
export function createFormSignal<T extends Record<string, unknown>>(
  marker: FormMarker<T>
): FormSignal<T> {
  const config = marker.config;
  const initial = config.initial;

  // ==================
  // CORE STATE
  // ==================

  /** Current form values */
  const persistStorage =
    config.storage !== undefined
      ? config.storage
      : typeof window !== 'undefined'
      ? window.localStorage
      : null;

  /** Pure read of persisted values (no signal writes — NG0600-safe). */
  function readFromStorage(): T | null {
    if (!config.persist || !persistStorage) return null;
    try {
      const stored = persistStorage.getItem(config.persist);
      if (stored) {
        return { ...initial, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  // Hydrate from storage via the INITIAL value — markers materialize lazily,
  // often during template rendering, and a post-create .set() here would
  // throw NG0600 for returning users with a persisted draft.
  const valuesSignal: WritableSignal<T> = signal(
    readFromStorage() ?? { ...initial }
  );

  /** Per-field touched state */
  const touchedSignal: WritableSignal<Record<keyof T, boolean>> = signal(
    Object.keys(initial).reduce((acc, key) => {
      acc[key as keyof T] = false;
      return acc;
    }, {} as Record<keyof T, boolean>)
  );

  /**
   * Async validator results, keyed by field. Each entry records the value it
   * was computed FOR — a stale entry (value has since changed) is ignored by
   * the `errors` computed, so async errors self-invalidate on edit.
   */
  const asyncErrorsSignal: WritableSignal<
    Partial<Record<keyof T, { value: unknown; error: string | null }>>
  > = signal({});

  /** Submitting state */
  const submittingSignal: WritableSignal<boolean> = signal(false);

  // ==================
  // COMPUTED SIGNALS
  // ==================

  /** Run the sync validators for one field against a values snapshot. */
  function runSyncValidators(field: keyof T, values: T): string | null {
    const fieldValidators = config.validators?.[field];
    if (!fieldValidators) return null;
    const list = Array.isArray(fieldValidators)
      ? fieldValidators
      : [fieldValidators];
    for (const validator of list) {
      const error = validator(
        values[field],
        values as Record<string, unknown>
      );
      if (error) return error;
    }
    return null;
  }

  /**
   * Per-field errors, derived from the current values — sync validators are
   * PURE and re-run reactively on every values change (an empty form with
   * `required` validators is invalid from the start, and cross-field rules
   * like `validators.when` re-evaluate when any sibling changes). Async
   * validator results (from `validate()`/`validateField()`/`submit()`) are
   * merged in when sync passes and the value hasn't changed since the check.
   *
   * Derived (not written) on purpose: markers materialize lazily, often
   * during template rendering, and writing a signal there throws NG0600.
   */
  const errors = computed<Partial<Record<keyof T, string | null>>>(() => {
    const values = valuesSignal();
    const asyncErrs = asyncErrorsSignal();
    const result: Partial<Record<keyof T, string | null>> = {};
    for (const key of Object.keys(initial) as Array<keyof T>) {
      let error = runSyncValidators(key, values);
      if (!error) {
        const asyncEntry = asyncErrs[key];
        if (asyncEntry && asyncEntry.value === values[key]) {
          error = asyncEntry.error;
        }
      }
      result[key] = error ?? null;
    }
    return result;
  });

  const dirty = computed(() => {
    const current = valuesSignal();
    const eq = config.equalityFn ?? defaultEquality;
    return Object.keys(initial).some(
      (key) => !eq(current[key as keyof T], initial[key as keyof T])
    );
  });

  const valid = computed(() => {
    const errs = errors();
    return Object.values(errs).every((e) => e === null || e === undefined);
  });

  const errorList = computed(() => {
    const errs = errors();
    return Object.values(errs).filter(
      (e): e is string => e !== null && e !== undefined
    );
  });

  // ==================
  // PERSISTENCE
  // ==================

  let persistTimeout: ReturnType<typeof setTimeout> | null = null;

  function loadFromStorage(): void {
    const loaded = readFromStorage();
    if (loaded) {
      valuesSignal.set(loaded);
    }
  }

  function saveToStorage(): void {
    if (!config.persist || !persistStorage) return;
    try {
      persistStorage.setItem(config.persist, JSON.stringify(valuesSignal()));
    } catch {
      // Ignore storage errors
    }
  }

  function schedulePersist(): void {
    if (!config.persist) return;
    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(saveToStorage, config.persistDebounceMs ?? 500);
  }

  // ==================
  // DEEP FIELD ACCESS
  // ==================

  function createFieldAccessor<V>(
    path: string,
    getValue: () => V,
    setValue: (v: V) => void
  ): { (): V; set(v: V): void; update(fn: (c: V) => V): void } {
    const accessor = (() => getValue()) as {
      (): V;
      set(v: V): void;
      update(fn: (c: V) => V): void;
    };
    accessor.set = (v: V) => {
      setValue(v);
      schedulePersist();
    };
    accessor.update = (fn: (c: V) => V) => {
      setValue(fn(getValue()));
      schedulePersist();
    };
    return accessor;
  }

  function createFieldsProxy(values: T): FormFields<T> {
    const proxy = {} as FormFields<T>;

    for (const key of Object.keys(values)) {
      const k = key as keyof T;
      const fieldAccessor = createFieldAccessor(
        key,
        () => valuesSignal()[k],
        (v) => valuesSignal.update((curr) => ({ ...curr, [k]: v }))
      );

      // If value is nested object, recursively create accessors
      const value = values[k];
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        // Nested - add child accessors
        const nested = createFieldsProxy(value as unknown as T);
        Object.assign(fieldAccessor, nested);
      }

      (proxy as Record<string, unknown>)[key] = fieldAccessor;
    }

    return proxy;
  }

  const fieldsProxy = createFieldsProxy(initial);

  // ==================
  // VALIDATION
  // ==================

  async function validateField(field: keyof T): Promise<boolean> {
    const value = valuesSignal()[field];
    const syncError = runSyncValidators(field, valuesSignal());

    // Async validator (only if sync passed)
    const asyncValidator = config.asyncValidators?.[field];
    if (!syncError && asyncValidator) {
      const asyncError = await asyncValidator(value);
      asyncErrorsSignal.update((errs) => ({
        ...errs,
        [field]: { value, error: asyncError },
      }));
      return asyncError === null;
    }

    return syncError === null;
  }

  async function validateAll(): Promise<boolean> {
    const fields = Object.keys(initial) as Array<keyof T>;
    const results = await Promise.all(fields.map(validateField));
    return results.every(Boolean);
  }

  // ==================
  // WIZARD
  // ==================

  let wizard: FormWizard | undefined;

  if (config.wizard) {
    const wizardConfig = config.wizard;
    const currentStepSignal = signal(0);

    const stepName = computed(
      () => wizardConfig.steps[currentStepSignal()] ?? ''
    );
    const canNext = computed(
      () => currentStepSignal() < wizardConfig.steps.length - 1
    );
    const canPrev = computed(() => currentStepSignal() > 0);
    const isLastStep = computed(
      () => currentStepSignal() === wizardConfig.steps.length - 1
    );
    const isFirstStep = computed(() => currentStepSignal() === 0);

    async function validateCurrentStep(): Promise<boolean> {
      const stepIdx = currentStepSignal();
      const stepNameStr = wizardConfig.steps[stepIdx];
      const stepCfg = wizardConfig.stepConfig?.[stepNameStr];

      // Check step-specific validation
      if (stepCfg?.validate) {
        const result = await stepCfg.validate();
        if (!result) return false;
      }

      // Check step fields validation
      const stepFields =
        wizardConfig.stepFields?.[stepNameStr] ?? stepCfg?.fields ?? [];
      for (const field of stepFields) {
        const isValid = await validateField(field as keyof T);
        if (!isValid) return false;
      }

      return true;
    }

    wizard = {
      currentStep: currentStepSignal.asReadonly(),
      stepName,
      steps: signal(wizardConfig.steps).asReadonly(),
      canNext,
      canPrev,
      isLastStep,
      isFirstStep,

      async next(): Promise<boolean> {
        const valid = await validateCurrentStep();
        if (!valid) return false;

        const current = currentStepSignal();
        if (current < wizardConfig.steps.length - 1) {
          currentStepSignal.set(current + 1);
          return true;
        }
        return false;
      },

      prev(): void {
        const current = currentStepSignal();
        if (current > 0) {
          currentStepSignal.set(current - 1);
        }
      },

      async goTo(step: number | string): Promise<boolean> {
        const targetIdx =
          typeof step === 'number' ? step : wizardConfig.steps.indexOf(step);

        if (targetIdx < 0 || targetIdx >= wizardConfig.steps.length) {
          return false;
        }

        // Can only go forward if current step is valid
        if (targetIdx > currentStepSignal()) {
          const valid = await validateCurrentStep();
          if (!valid) return false;
        }

        currentStepSignal.set(targetIdx);
        return true;
      },

      reset(): void {
        currentStepSignal.set(0);
      },
    };
  }

  // ==================
  // API
  // ==================

  // Create the callable function first
  const formSignalFn = (() => valuesSignal()) as FormSignal<T>;

  // Add all properties
  formSignalFn.$ = fieldsProxy;

  // @internal — marker config, read by bridge enhancers (e.g. ng-forms
  // formBridge) to mirror the marker's validators onto Angular controls.
  Object.defineProperty(formSignalFn, '__config', {
    value: config,
    enumerable: false,
  });

  // @internal — the raw values signal, used by ng-forms' Signal Forms bridge
  // (markerSignalForm) as the FieldTree model so Angular's form() and the
  // marker share one source of truth. `errors`/`valid` are computed over
  // this signal, so they stay live for writes from either side.
  Object.defineProperty(formSignalFn, '__model', {
    value: valuesSignal,
    enumerable: false,
  });

  // v10.4 — .data() alias. Identical to calling the marker itself.
  // Absorbs the form-vocab hallucination ("how do I read form values?
  // .data()") observed in the v10.3.3 AI-codegen benchmark as the last
  // residual marker-method confusion class.
  formSignalFn.data = (): T => valuesSignal();

  formSignalFn.set = (values: Partial<T>): void => {
    valuesSignal.update((curr) => ({ ...curr, ...values }));
    schedulePersist();
  };

  formSignalFn.patch = (values: Partial<T>): void => {
    valuesSignal.update((curr) => ({ ...curr, ...values }));
    schedulePersist();
  };

  formSignalFn.reset = (): void => {
    valuesSignal.set({ ...initial });
    touchedSignal.set(
      Object.keys(initial).reduce((acc, key) => {
        acc[key as keyof T] = false;
        return acc;
      }, {} as Record<keyof T, boolean>)
    );
    asyncErrorsSignal.set({});
    wizard?.reset();
    schedulePersist();
  };

  formSignalFn.clear = (): void => {
    const empty = Object.keys(initial).reduce((acc, key) => {
      const val = initial[key as keyof T];
      acc[key as keyof T] = (
        typeof val === 'string'
          ? ''
          : typeof val === 'number'
          ? 0
          : Array.isArray(val)
          ? []
          : val === null
          ? null
          : typeof val === 'object'
          ? {}
          : val
      ) as T[keyof T];
      return acc;
    }, {} as T);
    valuesSignal.set(empty);
    touchedSignal.set(
      Object.keys(initial).reduce((acc, key) => {
        acc[key as keyof T] = false;
        return acc;
      }, {} as Record<keyof T, boolean>)
    );
    asyncErrorsSignal.set({});
    schedulePersist();
  };

  // Validation signals
  formSignalFn.valid = valid;
  formSignalFn.dirty = dirty;
  formSignalFn.submitting = submittingSignal.asReadonly();
  formSignalFn.touched = touchedSignal.asReadonly();
  formSignalFn.errors = errors;
  formSignalFn.errorList = errorList;

  // Validation methods
  formSignalFn.validate = validateAll;
  formSignalFn.validateField = validateField;

  formSignalFn.touch = (field: keyof T): void => {
    touchedSignal.update((t) => ({ ...t, [field]: true }));
  };

  formSignalFn.touchAll = (): void => {
    touchedSignal.update((t) => {
      const updated = { ...t };
      for (const key of Object.keys(t)) {
        updated[key as keyof T] = true;
      }
      return updated;
    });
  };

  // Submit
  formSignalFn.submit = async <R>(
    handler: (values: T) => Promise<R>
  ): Promise<R | null> => {
    submittingSignal.set(true);
    try {
      const isValid = await validateAll();
      if (!isValid) {
        return null;
      }
      const result = await handler(valuesSignal());
      return result;
    } finally {
      submittingSignal.set(false);
    }
  };

  // Wizard
  formSignalFn.wizard = wizard;

  // Persistence methods
  formSignalFn.persistNow = (): void => {
    if (persistTimeout) clearTimeout(persistTimeout);
    saveToStorage();
  };

  formSignalFn.reload = (): void => {
    loadFromStorage();
  };

  formSignalFn.clearStorage = (): void => {
    if (config.persist && persistStorage) {
      persistStorage.removeItem(config.persist);
    }
  };

  return formSignalFn;
}

// =============================================================================
// HELPERS
// =============================================================================

function defaultEquality(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// =============================================================================
// VALIDATORS (Common validators)
// =============================================================================

/**
 * Tag a validator with a semantic kind (see {@link Validator}).
 *
 * Returns a NEW closure that delegates to `validator` — the passed function
 * is never mutated, so tagging a shared validator instance for one form
 * cannot leak the kind into other forms using the same instance.
 *
 * Bridges (e.g. ng-forms' `markerSignalForm`) surface the kind as the Signal
 * Forms error `kind` instead of the generic `'signalTree'` fallback.
 *
 * @example
 * ```typescript
 * const noProfanity = withKind(
 *   (value: unknown) =>
 *     typeof value === 'string' && BANNED.some((w) => value.includes(w))
 *       ? 'Keep it clean'
 *       : null,
 *   'profanity'
 * );
 *
 * form<Post>({
 *   initial: { title: '' },
 *   validators: { title: noProfanity },
 * });
 * // Bridged errors: { kind: 'profanity', message: 'Keep it clean' }
 * ```
 */
export function withKind<T>(
  validator: Validator<T>,
  kind: string
): Validator<T> {
  const wrapped: Validator<T> = (value, formValues) =>
    validator(value, formValues);
  wrapped.validatorKind = kind;
  return wrapped;
}

/**
 * `withKind` + constraint params for the built-in factories — params let
 * branded-error bridges construct Angular's typed validation errors
 * (`minError(min, …)` etc.). Internal: `withKind` wraps rather than mutates,
 * so tagging here never touches a caller-owned closure.
 * @internal
 */
function withKindAndParams<T>(
  validator: Validator<T>,
  kind: string,
  params: Record<string, unknown>
): Validator<T> {
  const wrapped = withKind(validator, kind);
  wrapped.validatorParams = params;
  return wrapped;
}

export const validators = {
  required: (message = 'This field is required') =>
    withKind(
      (value: unknown) =>
        value === null || value === undefined || value === '' ? message : null,
      'required'
    ),

  minLength: (min: number, message?: string) =>
    withKindAndParams(
      (value: unknown) =>
        typeof value === 'string' && value.length < min
          ? message ?? `Must be at least ${min} characters`
          : null,
      'minLength',
      { minLength: min }
    ),

  maxLength: (max: number, message?: string) =>
    withKindAndParams(
      (value: unknown) =>
        typeof value === 'string' && value.length > max
          ? message ?? `Must be at most ${max} characters`
          : null,
      'maxLength',
      { maxLength: max }
    ),

  min: (min: number, message?: string) =>
    withKindAndParams(
      (value: unknown) =>
        typeof value === 'number' && value < min
          ? message ?? `Must be at least ${min}`
          : null,
      'min',
      { min }
    ),

  max: (max: number, message?: string) =>
    withKindAndParams(
      (value: unknown) =>
        typeof value === 'number' && value > max
          ? message ?? `Must be at most ${max}`
          : null,
      'max',
      { max }
    ),

  email: (message = 'Invalid email address') =>
    withKind(
      (value: unknown) =>
        typeof value === 'string' &&
        value !== '' &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? message
          : null,
      'email'
    ),

  pattern: (regex: RegExp, message = 'Invalid format') =>
    withKindAndParams(
      (value: unknown) =>
        typeof value === 'string' && value !== '' && !regex.test(value)
          ? message
          : null,
      'pattern',
      { pattern: regex }
    ),

  /**
   * Conditional validator - only validates when condition is met.
   * Note: Requires form context to be passed during validation.
   *
   * `when` has no validator identity of its own — it delegates to the inner
   * `validator`, so the returned closure FORWARDS the inner validator's
   * `validatorKind` (and internal `validatorParams`), if any. A
   * `when(cond, validators.required())` therefore bridges as
   * `kind: 'required'`; wrapping an untagged custom validator still falls
   * back to the bridge's generic kind.
   */
  when: <T>(
    condition: (form: T) => boolean,
    validator: Validator<unknown>
  ): Validator<unknown> => {
    const wrapped: Validator<unknown> = (
      value: unknown,
      form?: Record<string, unknown>
    ): string | null => {
      if (!form) {
        // Form context not available - skip validation
        return null;
      }
      if (condition(form as unknown as T)) {
        return validator(value, form);
      }
      return null;
    };
    if (validator.validatorKind !== undefined) {
      wrapped.validatorKind = validator.validatorKind;
    }
    if (validator.validatorParams !== undefined) {
      wrapped.validatorParams = validator.validatorParams;
    }
    return wrapped;
  },
};
