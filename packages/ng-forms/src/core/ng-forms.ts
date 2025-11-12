import {
  computed,
  effect,
  inject,
  signal,
  Signal,
  WritableSignal,
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
  HostListener,
  Input,
  Output,
  EventEmitter,
  isSignal,
  forwardRef,
  OnInit,
} from '@angular/core';
import {
  AbstractControl,
  AsyncValidatorFn as AngularAsyncValidatorFn,
  ControlValueAccessor,
  FormArray,
  FormControl,
  FormGroup,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  ValidatorFn as AngularValidatorFn,
} from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { deepClone, matchPath, mergeDeep, parsePath } from '@signaltree/shared';
import { firstValueFrom, isObservable, Observable, Subscription } from 'rxjs';

/**
 * @fileoverview Angular Forms Integration for SignalTree
 *
 * Provides comprehensive Angular form integration including FormTree,
 * directives, validators, enhanced array operations, and RxJS bridge.
 */

// Re-export core types needed for forms
import type { SignalTree, TreeConfig, TreeNode } from '@signaltree/core';
// ============================================
// FORM TREE TYPES
// ============================================

export type FormTreeAsyncValidatorFn<T> = (
  value: T
) => Observable<string | null> | Promise<string | null>;

export type EnhancedArraySignal<T> = WritableSignal<T[]> & {
  push: (item: T) => void;
  removeAt: (index: number) => void;
  setAt: (index: number, value: T) => void;
  insertAt: (index: number, item: T) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
};

export type FieldValidator = (value: unknown) => string | null;

export interface FieldConfig {
  debounceMs?: number;
  validators?: Record<string, FieldValidator> | FieldValidator[];
  asyncValidators?:
    | Record<string, FormTreeAsyncValidatorFn<unknown>>
    | Array<FormTreeAsyncValidatorFn<unknown>>;
}

export interface ConditionalField<T> {
  when: (values: T) => boolean;
  fields: string[];
}

export interface FormTreeOptions<T extends Record<string, unknown>>
  extends TreeConfig {
  validators?: SyncValidatorMap;
  asyncValidators?: AsyncValidatorMap;
  destroyRef?: DestroyRef;
  fieldConfigs?: Record<string, FieldConfig>;
  conditionals?: Array<ConditionalField<T>>;
  persistKey?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  persistDebounceMs?: number;
  validationBatchMs?: number;
}

/**
 * Form tree type that flattens the state access while maintaining form-specific properties
 */
export type FormTree<T extends Record<string, unknown>> = {
  // Flattened state access - direct access to form values as signals
  state: TreeNode<T>;
  $: TreeNode<T>; // Alias for state

  // Underlying Angular form structure
  form: FormGroup;

  // Form-specific signals
  errors: WritableSignal<Record<string, string>>;
  asyncErrors: WritableSignal<Record<string, string>>;
  touched: WritableSignal<Record<string, boolean>>;
  asyncValidating: WritableSignal<Record<string, boolean>>;
  dirty: WritableSignal<boolean>;
  valid: WritableSignal<boolean>;
  submitting: WritableSignal<boolean>;

  // Form methods
  unwrap(): T;
  setValue(field: string, value: unknown): void;
  setValues(values: Partial<T>): void;
  reset(): void;
  submit<TResult>(submitFn: (values: T) => Promise<TResult>): Promise<TResult>;
  validate(field?: string): Promise<void>;

  // Field-level helpers
  getFieldError(field: string): Signal<string | undefined>;
  getFieldAsyncError(field: string): Signal<string | undefined>;
  getFieldTouched(field: string): Signal<boolean | undefined>;
  isFieldValid(field: string): Signal<boolean>;
  isFieldAsyncValidating(field: string): Signal<boolean | undefined>;

  // Direct access to field errors
  fieldErrors: Record<string, Signal<string | undefined>>;
  fieldAsyncErrors: Record<string, Signal<string | undefined>>;

  // Keep values tree for backward compatibility
  values: SignalTree<T>;

  // Cleanup helpers to tear down subscriptions created for bridge layer
  destroy(): void;
};

export class FormValidationError extends Error {
  constructor(
    public readonly errors: Record<string, string>,
    public readonly asyncErrors: Record<string, string>
  ) {
    super('Form validation failed');
    this.name = 'FormValidationError';
  }
}

type SyncValidatorMap = Record<string, (value: unknown) => string | null>;
type AsyncValidatorMap = Record<string, FormTreeAsyncValidatorFn<unknown>>;

const SYNC_ERROR_KEY = 'signaltree';
const ASYNC_ERROR_KEY = 'signaltreeAsync';

// ============================================
// UTILITY FUNCTIONS
// ============================================

// ============================================
// FORM TREE IMPLEMENTATION
// ============================================

export function createFormTree<T extends Record<string, unknown>>(
  initialValues: T,
  config: FormTreeOptions<T> = {}
): FormTree<T> {
  const {
    validators: baseValidators = {},
    asyncValidators: baseAsyncValidators = {},
    destroyRef: providedDestroyRef,
    fieldConfigs = {},
    conditionals = [],
    persistKey,
    storage,
    persistDebounceMs = 100,
    validationBatchMs = 0,
    ...treeConfig
  } = config;

  const syncValidators = normalizeSyncValidators(baseValidators, fieldConfigs);
  const asyncValidators = normalizeAsyncValidators(
    baseAsyncValidators,
    fieldConfigs
  );

  const { values: hydratedInitialValues } = hydrateInitialValues(
    initialValues,
    persistKey,
    storage
  );
  const initialSnapshot = deepClone(hydratedInitialValues);

  const valuesTree = signalTree(hydratedInitialValues, treeConfig);
  assertTreeNode<T>(valuesTree.state);
  const flattenedState = valuesTree.state;

  enhanceArraysRecursively(
    flattenedState as unknown as Record<string, unknown>
  );

  const formGroup = createAbstractControl(
    hydratedInitialValues,
    '',
    syncValidators,
    asyncValidators
  ) as FormGroup;

  const destroyRef = providedDestroyRef ?? tryInjectDestroyRef();
  const cleanupCallbacks: Array<() => void> = [];

  const errors = signal<Record<string, string>>({});
  const asyncErrors = signal<Record<string, string>>({});
  const touched = signal<Record<string, boolean>>({});
  const asyncValidating = signal<Record<string, boolean>>({});
  const dirty = signal(formGroup.dirty);
  const valid = signal(formGroup.valid && !formGroup.pending);
  const submitting = signal(false);

  const refreshRunner = () => {
    const snapshot = collectControlSnapshot(formGroup);
    errors.set(snapshot.syncErrors);
    asyncErrors.set(snapshot.asyncErrors);
    touched.set(snapshot.touched);
    asyncValidating.set(snapshot.pending);
    dirty.set(formGroup.dirty);
    valid.set(formGroup.valid && !formGroup.pending);
  };

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshAggregates = (immediate = false) => {
    if (immediate || validationBatchMs <= 0) {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      refreshRunner();
      return;
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshRunner();
    }, validationBatchMs);
  };

  refreshAggregates(true);

  const persistController = createPersistController(
    formGroup,
    persistKey,
    storage,
    persistDebounceMs,
    cleanupCallbacks
  );
  persistController.persistImmediately();

  const fieldErrorKeys = new Set([
    ...Object.keys(syncValidators),
    ...Object.keys(asyncValidators),
  ]);

  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};

  fieldErrorKeys.forEach((fieldPath) => {
    fieldErrors[fieldPath] = computed(() => errors()[fieldPath]);
    fieldAsyncErrors[fieldPath] = computed(() => asyncErrors()[fieldPath]);
  });

  const fieldConfigLookup = (path: string) =>
    resolveFieldConfig(fieldConfigs, path);

  const connectControlRecursive = (control: AbstractControl, path: string) => {
    if (control instanceof FormGroup) {
      Object.entries(control.controls).forEach(([key, child]) => {
        connectControlRecursive(child, joinPath(path, key));
      });
      return;
    }

    if (control instanceof FormArray) {
      const arraySignal = getSignalAtPath(flattenedState, path);
      if (arraySignal) {
        connectFormArrayAndSignal(
          control,
          arraySignal as EnhancedArraySignal<unknown>,
          path,
          syncValidators,
          asyncValidators,
          cleanupCallbacks,
          connectControlRecursive
        );
      }

      control.controls.forEach((child, index) => {
        connectControlRecursive(child, joinPath(path, String(index)));
      });
      return;
    }

    const signalAtPath = getSignalAtPath(flattenedState, path);
    if (signalAtPath) {
      connectControlAndSignal(
        control as FormControl,
        signalAtPath as WritableSignal<unknown>,
        cleanupCallbacks,
        fieldConfigLookup(path)
      );
    }
  };

  connectControlRecursive(formGroup, '');

  const conditionalState = new Map<string, boolean>();
  const applyConditionals =
    conditionals.length > 0
      ? () => {
          const values = formGroup.getRawValue() as T;
          conditionals.forEach(({ when, fields }) => {
            let visible = true;
            try {
              visible = when(values);
            } catch {
              visible = true;
            }
            fields.forEach((fieldPath) => {
              const control = formGroup.get(fieldPath);
              if (!control) {
                return;
              }
              const previous = conditionalState.get(fieldPath);
              if (previous === visible) {
                return;
              }
              conditionalState.set(fieldPath, visible);
              if (visible) {
                control.enable({ emitEvent: false });
              } else {
                control.disable({ emitEvent: false });
              }
            });
          });
        }
      : () => undefined;

  applyConditionals();

  const aggregateSubscriptions: Subscription[] = [];
  aggregateSubscriptions.push(
    formGroup.valueChanges.subscribe(() => {
      refreshAggregates();
      persistController.schedulePersist();
      applyConditionals();
    })
  );
  aggregateSubscriptions.push(
    formGroup.statusChanges.subscribe(() => refreshAggregates())
  );
  if (formGroup.events) {
    aggregateSubscriptions.push(
      formGroup.events.subscribe(() => refreshAggregates())
    );
  }

  cleanupCallbacks.push(() => {
    aggregateSubscriptions.forEach((sub) => sub.unsubscribe());
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
  });

  if (destroyRef) {
    destroyRef.onDestroy(() => {
      cleanupCallbacks.splice(0).forEach((fn) => fn());
    });
  }

  const setValue = (field: string, value: unknown) => {
    const targetSignal = getSignalAtPath(flattenedState, field);
    const control = formGroup.get(field);

    if (targetSignal && 'set' in targetSignal) {
      (targetSignal as WritableSignal<unknown>).set(value);
    } else if (control) {
      (control as AbstractControl).setValue(value, { emitEvent: true });
    }

    if (control) {
      const untypedControl = control as AbstractControl;
      untypedControl.markAsTouched();
      untypedControl.markAsDirty();
      untypedControl.updateValueAndValidity({ emitEvent: true });
    }

    refreshAggregates(true);
    persistController.schedulePersist();
  };

  const setValues = (values: Partial<T>) => {
    Object.entries(values).forEach(([key, value]) => {
      setValue(key, value);
    });
  };

  const reset = () => {
    formGroup.reset(initialSnapshot);
    submitting.set(false);
    refreshAggregates(true);
    persistController.persistImmediately();
    applyConditionals();
  };

  const validate = async (field?: string): Promise<void> => {
    if (field) {
      const control = formGroup.get(field);
      if (!control) {
        return;
      }

      control.markAsTouched();
      control.updateValueAndValidity({ emitEvent: true });
      refreshAggregates(true);
      await waitForPending(control);
      refreshAggregates(true);
      return;
    }

    formGroup.markAllAsTouched();
    formGroup.updateValueAndValidity({ emitEvent: true });
    refreshAggregates(true);
    await waitForPending(formGroup);
    refreshAggregates(true);
  };

  const submit = async <TResult>(
    submitFn: (values: T) => Promise<TResult>
  ): Promise<TResult> => {
    submitting.set(true);
    try {
      await validate();

      if (!valid()) {
        throw new FormValidationError(errors(), asyncErrors());
      }

      const currentValues = formGroup.getRawValue() as T;
      const result = await submitFn(currentValues);
      return result;
    } finally {
      submitting.set(false);
      refreshAggregates(true);
    }
  };

  const destroy = () => {
    cleanupCallbacks.splice(0).forEach((fn) => fn());
  };

  const formTree: FormTree<T> = {
    state: flattenedState,
    $: flattenedState,
    form: formGroup,
    errors,
    asyncErrors,
    touched,
    asyncValidating,
    dirty,
    valid,
    submitting,
    unwrap: () => valuesTree(),
    setValue,
    setValues,
    reset,
    submit,
    validate,
    getFieldError: (field: string) =>
      fieldErrors[field] || computed(() => undefined),
    getFieldAsyncError: (field: string) =>
      fieldAsyncErrors[field] || computed(() => undefined),
    getFieldTouched: (field: string) =>
      computed(() => formGroup.get(field)?.touched ?? false),
    isFieldValid: (field: string) =>
      computed(() => {
        const control = formGroup.get(field);
        return !!control && control.valid && !control.pending;
      }),
    isFieldAsyncValidating: (field: string) =>
      computed(() => !!formGroup.get(field)?.pending),
    fieldErrors,
    fieldAsyncErrors,
    values: valuesTree,
    destroy,
  };

  return formTree;
}

export function createVirtualFormArray<T>(
  items: T[],
  visibleRange: { start: number; end: number },
  controlFactory: (value: T, index: number) => AbstractControl = (value) =>
    new FormControl(value)
): FormArray {
  const start = Math.max(0, visibleRange.start);
  const end = Math.max(start, visibleRange.end);

  const controls = items
    .slice(start, end)
    .map((item, offset) => controlFactory(item, start + offset));

  return new FormArray(controls);
}

function enhanceArraysRecursively(
  obj: Record<string, unknown>,
  visited = new WeakSet<object>()
): void {
  if (visited.has(obj)) {
    return;
  }
  visited.add(obj);

  for (const key in obj) {
    const value = obj[key];
    if (isSignal(value)) {
      const signalValue = (value as Signal<unknown>)();
      if (Array.isArray(signalValue)) {
        obj[key] = enhanceArray(value as WritableSignal<unknown[]>);
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      enhanceArraysRecursively(value as Record<string, unknown>, visited);
    }
  }
}

const enhanceArray = <U>(
  arraySignal: WritableSignal<U[]>
): EnhancedArraySignal<U> => {
  const enhanced = arraySignal as EnhancedArraySignal<U>;

  enhanced.push = (item: U) => {
    arraySignal.update((arr) => [...arr, item]);
  };

  enhanced.removeAt = (index: number) => {
    arraySignal.update((arr) => arr.filter((_, i) => i !== index));
  };

  enhanced.setAt = (index: number, value: U) => {
    arraySignal.update((arr) =>
      arr.map((item, i) => (i === index ? value : item))
    );
  };

  enhanced.insertAt = (index: number, item: U) => {
    arraySignal.update((arr) => [
      ...arr.slice(0, index),
      item,
      ...arr.slice(index),
    ]);
  };

  enhanced.move = (from: number, to: number) => {
    arraySignal.update((arr) => {
      const newArr = [...arr];
      const [item] = newArr.splice(from, 1);
      if (item !== undefined) {
        newArr.splice(to, 0, item);
      }
      return newArr;
    });
  };

  enhanced.clear = () => {
    arraySignal.set([]);
  };

  return enhanced;
};

function getSignalAtPath<T>(
  node: TreeNode<T>,
  path: string
): WritableSignal<unknown> | null {
  if (!path) {
    return null;
  }

  const segments = parsePath(path);
  let current: unknown = node;

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (isSignal(current)) {
    return current as WritableSignal<unknown>;
  }

  return null;
}

function joinPath(parent: string, segment: string): string {
  return parent ? `${parent}.${segment}` : segment;
}

function wrapSyncValidator(
  validator: (value: unknown) => string | null
): AngularValidatorFn {
  return (control) => {
    const result = validator(control.value);
    return result ? { [SYNC_ERROR_KEY]: result } : null;
  };
}

function wrapAsyncValidator(
  validator: FormTreeAsyncValidatorFn<unknown>
): AngularAsyncValidatorFn {
  return async (control) => {
    try {
      const maybeAsync = validator(control.value);
      const resolved = isObservable(maybeAsync)
        ? await firstValueFrom(maybeAsync)
        : await maybeAsync;
      return resolved ? { [ASYNC_ERROR_KEY]: resolved } : null;
    } catch {
      return { [ASYNC_ERROR_KEY]: 'Validation error' };
    }
  };
}

function createAbstractControl(
  value: unknown,
  path: string,
  validators: SyncValidatorMap,
  asyncValidators: AsyncValidatorMap
): AbstractControl {
  const syncValidator = findValidator(validators, path);
  const asyncValidator = findValidator(asyncValidators, path);

  const syncFns = syncValidator
    ? [wrapSyncValidator(syncValidator)]
    : undefined;
  const asyncFns = asyncValidator
    ? [wrapAsyncValidator(asyncValidator)]
    : undefined;

  if (Array.isArray(value)) {
    const controls = value.map((item, index) =>
      createAbstractControl(
        item,
        joinPath(path, String(index)),
        validators,
        asyncValidators
      )
    );
    return new FormArray(controls, syncFns, asyncFns);
  }

  if (isPlainObject(value)) {
    const controls: Record<string, AbstractControl> = {};
    for (const [key, child] of Object.entries(value)) {
      controls[key] = createAbstractControl(
        child,
        joinPath(path, key),
        validators,
        asyncValidators
      );
    }
    return new FormGroup(controls, {
      validators: syncFns,
      asyncValidators: asyncFns,
    });
  }

  return new FormControl(value, {
    validators: syncFns,
    asyncValidators: asyncFns,
    nonNullable: false,
  });
}

function connectControlAndSignal(
  control: FormControl,
  valueSignal: WritableSignal<unknown>,
  cleanupCallbacks: Array<() => void>,
  fieldConfig?: FieldConfig
): void {
  let updatingFromControl = false;
  let updatingFromSignal = false;
  let versionCounter = 0;
  let lastControlVersion = 0;
  let controlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = fieldConfig?.debounceMs ?? 0;

  const originalSet = valueSignal.set.bind(valueSignal);
  const originalUpdate = valueSignal.update.bind(valueSignal);

  const applyControlValue = (value: unknown) => {
    updatingFromSignal = true;
    if (!Object.is(control.value, value)) {
      const untypedControl = control as AbstractControl;
      untypedControl.setValue(value, { emitEvent: true });
      untypedControl.markAsDirty();
    }
    updatingFromSignal = false;
  };

  valueSignal.set = (value: unknown) => {
    const currentVersion = ++versionCounter;
    originalSet(value);
    if (updatingFromControl) {
      return;
    }
    if (lastControlVersion > currentVersion) {
      return;
    }
    applyControlValue(value);
  };

  valueSignal.update = (updater) => {
    const next = updater(valueSignal());
    valueSignal.set(next);
  };

  const pushUpdateFromControl = (value: unknown) => {
    updatingFromControl = true;
    lastControlVersion = ++versionCounter;
    originalSet(value);
    updatingFromControl = false;
  };

  const handleControlChange = (value: unknown) => {
    if (updatingFromSignal) {
      return;
    }

    if (debounceMs > 0) {
      if (controlDebounceTimer) {
        clearTimeout(controlDebounceTimer);
      }
      controlDebounceTimer = setTimeout(() => {
        controlDebounceTimer = null;
        pushUpdateFromControl(value);
      }, debounceMs);
      return;
    }

    pushUpdateFromControl(value);
  };

  const subscription = control.valueChanges.subscribe((value) => {
    handleControlChange(value);
  });

  cleanupCallbacks.push(() => {
    subscription.unsubscribe();
    valueSignal.set = originalSet;
    valueSignal.update = originalUpdate;
    if (controlDebounceTimer) {
      clearTimeout(controlDebounceTimer);
    }
  });
}

function connectFormArrayAndSignal(
  formArray: FormArray,
  arraySignal: EnhancedArraySignal<unknown>,
  path: string,
  validators: SyncValidatorMap,
  asyncValidators: AsyncValidatorMap,
  cleanupCallbacks: Array<() => void>,
  connectControlRecursive: (control: AbstractControl, path: string) => void
): void {
  let updatingFromControl = false;
  let updatingFromSignal = false;

  const originalSet = arraySignal.set.bind(arraySignal);
  const originalUpdate = arraySignal.update.bind(arraySignal);

  arraySignal.set = (value: unknown[]) => {
    originalSet(value);
    if (updatingFromControl) {
      return;
    }
    updatingFromSignal = true;
    syncFormArrayFromValue(
      formArray,
      value,
      path,
      validators,
      asyncValidators,
      connectControlRecursive
    );
    formArray.markAsDirty();
    updatingFromSignal = false;
  };

  arraySignal.update = (updater) => {
    const next = updater(arraySignal());
    arraySignal.set(next);
  };

  const subscription = formArray.valueChanges.subscribe((value) => {
    if (updatingFromSignal) {
      return;
    }
    updatingFromControl = true;
    originalSet(value as unknown[]);
    updatingFromControl = false;
  });

  cleanupCallbacks.push(() => {
    subscription.unsubscribe();
    arraySignal.set = originalSet;
    arraySignal.update = originalUpdate;
  });

  syncFormArrayFromValue(
    formArray,
    arraySignal(),
    path,
    validators,
    asyncValidators,
    connectControlRecursive
  );
}

function syncFormArrayFromValue(
  formArray: FormArray,
  nextValue: unknown[],
  path: string,
  validators: SyncValidatorMap,
  asyncValidators: AsyncValidatorMap,
  connectControlRecursive: (control: AbstractControl, path: string) => void
): void {
  if (!Array.isArray(nextValue)) {
    nextValue = [];
  }

  while (formArray.length > nextValue.length) {
    formArray.removeAt(formArray.length - 1);
  }

  nextValue.forEach((item, index) => {
    const childPath = joinPath(path, String(index));
    const existing = formArray.at(index);

    if (!existing) {
      const control = createAbstractControl(
        item,
        childPath,
        validators,
        asyncValidators
      );
      formArray.insert(index, control);
      connectControlRecursive(control, childPath);
      return;
    }

    if (existing instanceof FormArray) {
      syncFormArrayFromValue(
        existing,
        Array.isArray(item) ? item : [],
        childPath,
        validators,
        asyncValidators,
        connectControlRecursive
      );
      return;
    }

    if (existing instanceof FormGroup) {
      if (isPlainObject(item)) {
        existing.setValue(item as Record<string, unknown>, {
          emitEvent: false,
        });
      }
      return;
    }

    if (!Object.is(existing.value, item)) {
      const untypedExisting = existing as AbstractControl;
      untypedExisting.setValue(item, { emitEvent: false });
    }
  });
}

interface ControlSnapshot {
  syncErrors: Record<string, string>;
  asyncErrors: Record<string, string>;
  touched: Record<string, boolean>;
  pending: Record<string, boolean>;
}

function collectControlSnapshot(control: AbstractControl): ControlSnapshot {
  const snapshot: ControlSnapshot = {
    syncErrors: {},
    asyncErrors: {},
    touched: {},
    pending: {},
  };

  traverseControls(
    control,
    (currentPath, currentControl) => {
      if (!currentPath) {
        return;
      }

      if (currentControl.touched) {
        snapshot.touched[currentPath] = true;
      }

      if (currentControl.pending) {
        snapshot.pending[currentPath] = true;
      }

      const errors = currentControl.errors as ValidationErrors | null;
      if (!errors) {
        return;
      }

      const syncMessage = errors[SYNC_ERROR_KEY];
      if (typeof syncMessage === 'string') {
        snapshot.syncErrors[currentPath] = syncMessage;
      }

      const asyncMessage = errors[ASYNC_ERROR_KEY];
      if (typeof asyncMessage === 'string') {
        snapshot.asyncErrors[currentPath] = asyncMessage;
      }
    },
    ''
  );

  return snapshot;
}

function traverseControls(
  control: AbstractControl,
  visitor: (path: string, control: AbstractControl) => void,
  path = ''
): void {
  visitor(path, control);

  if (control instanceof FormGroup) {
    Object.entries(control.controls).forEach(([key, child]) => {
      traverseControls(child, visitor, joinPath(path, key));
    });
    return;
  }

  if (control instanceof FormArray) {
    control.controls.forEach((child, index) => {
      traverseControls(child, visitor, joinPath(path, String(index)));
    });
  }
}

function waitForPending(control: AbstractControl): Promise<void> {
  if (!control.pending) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const subscription = control.statusChanges.subscribe(() => {
      if (!control.pending) {
        subscription.unsubscribe();
        resolve();
      }
    });
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

function tryInjectDestroyRef(): DestroyRef | null {
  try {
    return inject(DestroyRef);
  } catch {
    return null;
  }
}

function normalizeSyncValidators(
  base: SyncValidatorMap,
  fieldConfigs: Record<string, FieldConfig>
): SyncValidatorMap {
  const buckets = new Map<string, FieldValidator[]>();

  for (const [path, validator] of Object.entries(base)) {
    const existing = buckets.get(path) ?? [];
    existing.push(validator);
    buckets.set(path, existing);
  }

  for (const [path, config] of Object.entries(fieldConfigs)) {
    const validators = toValidatorArray(config.validators);
    if (validators.length === 0) {
      continue;
    }
    const existing = buckets.get(path) ?? [];
    existing.push(...validators);
    buckets.set(path, existing);
  }

  const normalized: SyncValidatorMap = {};
  buckets.forEach((validators, path) => {
    normalized[path] = (value: unknown) => {
      for (const validator of validators) {
        const result = validator(value);
        if (result) {
          return result;
        }
      }
      return null;
    };
  });

  return { ...base, ...normalized };
}

function normalizeAsyncValidators(
  base: AsyncValidatorMap,
  fieldConfigs: Record<string, FieldConfig>
): AsyncValidatorMap {
  const buckets = new Map<string, Array<FormTreeAsyncValidatorFn<unknown>>>();

  for (const [path, validator] of Object.entries(base)) {
    const existing = buckets.get(path) ?? [];
    existing.push(validator);
    buckets.set(path, existing);
  }

  for (const [path, config] of Object.entries(fieldConfigs)) {
    const validators = toValidatorArray(config.asyncValidators);
    if (validators.length === 0) {
      continue;
    }
    const existing = buckets.get(path) ?? [];
    existing.push(...validators);
    buckets.set(path, existing);
  }

  const normalized: AsyncValidatorMap = {};
  buckets.forEach((validators, path) => {
    normalized[path] = async (value: unknown) => {
      for (const validator of validators) {
        const maybeAsync = validator(value);
        const result = isObservable(maybeAsync)
          ? await firstValueFrom(maybeAsync)
          : await maybeAsync;
        if (result) {
          return result;
        }
      }
      return null;
    };
  });

  return { ...base, ...normalized };
}

function toValidatorArray<T>(input?: Record<string, T> | T[]): T[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  return Object.values(input);
}

function hydrateInitialValues<T extends Record<string, unknown>>(
  initialValues: T,
  persistKey?: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): { values: T } {
  const baseClone = deepClone(initialValues);

  if (!persistKey || !storage) {
    return { values: baseClone };
  }

  try {
    const storedRaw = storage.getItem(persistKey);
    if (!storedRaw) {
      return { values: baseClone };
    }
    const parsed = JSON.parse(storedRaw) as Partial<T>;
    const merged = mergeDeep(baseClone, parsed);
    return { values: merged };
  } catch {
    return { values: baseClone };
  }
}

function assertTreeNode<T>(state: unknown): asserts state is TreeNode<T> {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid state structure for form tree');
  }
}

function resolveFieldConfig(
  fieldConfigs: Record<string, FieldConfig>,
  path: string
): FieldConfig | undefined {
  if (fieldConfigs[path]) {
    return fieldConfigs[path];
  }

  const keys = Object.keys(fieldConfigs);
  let match: { key: string; config: FieldConfig } | undefined;

  for (const key of keys) {
    if (!key.includes('*')) {
      continue;
    }
    if (matchPath(key, path)) {
      if (!match || match.key.length < key.length) {
        match = { key, config: fieldConfigs[key] };
      }
    }
  }

  if (match) {
    return match.config;
  }

  return fieldConfigs['*'];
}

function findValidator<T>(map: Record<string, T>, path: string): T | undefined {
  if (map[path]) {
    return map[path];
  }

  let candidate: { key: string; value: T } | undefined;
  for (const key of Object.keys(map)) {
    if (!key.includes('*')) {
      continue;
    }
    if (matchPath(key, path)) {
      if (!candidate || candidate.key.length < key.length) {
        candidate = { key, value: map[key] };
      }
    }
  }

  if (candidate) {
    return candidate.value;
  }

  return map['*'];
}

interface PersistController {
  schedulePersist: () => void;
  persistImmediately: () => void;
}

function createPersistController(
  formGroup: FormGroup,
  persistKey: string | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  debounceMs: number,
  cleanupCallbacks: Array<() => void>
): PersistController {
  if (!persistKey || !storage) {
    return {
      schedulePersist: () => undefined,
      persistImmediately: () => undefined,
    };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    try {
      const payload = JSON.stringify(formGroup.getRawValue());
      storage.setItem(persistKey, payload);
    } catch {
      // Swallow persistence errors to avoid breaking form updates
    }
  };

  const schedulePersist = () => {
    if (debounceMs <= 0) {
      persist();
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      persist();
    }, debounceMs);
  };

  cleanupCallbacks.push(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  return {
    schedulePersist,
    persistImmediately: persist,
  };
}

// ============================================
// ANGULAR DIRECTIVE
// ============================================

/**
 * Simple directive for two-way binding with signals
 */
@Directive({
  selector: '[signalTreeSignalValue]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SignalValueDirective),
      multi: true,
    },
  ],
  standalone: true,
})
export class SignalValueDirective implements ControlValueAccessor, OnInit {
  @Input() signalTreeSignalValue!: WritableSignal<unknown>;
  @Output() signalTreeSignalValueChange = new EventEmitter<unknown>();

  private elementRef = inject(ElementRef);
  private renderer = inject(Renderer2);

  private onChange: (value: unknown) => void = () => {
    // Empty implementation for ControlValueAccessor
  };
  private onTouched: () => void = () => {
    // Empty implementation for ControlValueAccessor
  };

  ngOnInit() {
    effect(() => {
      const value = this.signalTreeSignalValue();
      this.renderer.setProperty(this.elementRef.nativeElement, 'value', value);
    });
  }

  @HostListener('input', ['$event'])
  @HostListener('change', ['$event'])
  handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target?.value;
    if (value !== undefined) {
      this.signalTreeSignalValue.set(value);
      this.signalTreeSignalValueChange.emit(value);
      this.onChange(value);
    }
  }

  @HostListener('blur')
  handleBlur() {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    if (value !== undefined) {
      this.signalTreeSignalValue.set(value);
    }
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.renderer.setProperty(
      this.elementRef.nativeElement,
      'disabled',
      isDisabled
    );
  }
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [SignalValueDirective];
