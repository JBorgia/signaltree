/**
 * @fileoverview Angular Forms Integration for SignalTree
 *
 * Provides comprehensive Angular form integration including FormTree,
 * directives, validators, enhanced array operations, and RxJS bridge.
 */

import {
  Signal,
  WritableSignal,
  isSignal,
  signal,
  computed,
  effect,
  inject,
  Directive,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  ElementRef,
  Renderer2,
  HostListener,
  OnInit,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable } from 'rxjs';

// Re-export core types needed for forms
import type {
  SignalTree,
  TreeConfig,
  DeepSignalify,
  Middleware,
} from '@signaltree/core';
import { signalTree } from '@signaltree/core';

// ============================================
// FORM TREE TYPES
// ============================================

export type AsyncValidatorFn<T> = (
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

/**
 * Form tree type that flattens the state access while maintaining form-specific properties
 */
export type FormTree<T extends Record<string, unknown>> = {
  // Flattened state access - direct access to form values as signals
  state: DeepSignalify<T>;
  $: DeepSignalify<T>; // Alias for state

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
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Simple path parsing for nested field access
 */
function parsePath(path: string): string[] {
  return path.split('.');
}

// ============================================
// FORM TREE IMPLEMENTATION
// ============================================

export function createFormTree<T extends Record<string, unknown>>(
  initialValues: T,
  config: {
    validators?: Record<string, (value: unknown) => string | null>;
    asyncValidators?: Record<string, AsyncValidatorFn<unknown>>;
  } & TreeConfig = {}
): FormTree<T> {
  const { validators = {}, asyncValidators = {}, ...treeConfig } = config;

  // Create the underlying signal tree
  const valuesTree = signalTree(initialValues, treeConfig);

  // Ensure the state has the correct type - this is the key fix
  const flattenedState = valuesTree.state as DeepSignalify<T>;

  // Create form-specific signals
  const formSignals = {
    errors: signal<Record<string, string>>({}),
    asyncErrors: signal<Record<string, string>>({}),
    touched: signal<Record<string, boolean>>({}),
    asyncValidating: signal<Record<string, boolean>>({}),
    dirty: signal(false),
    valid: signal(true),
    submitting: signal(false),
  };

  const markDirty = () => formSignals.dirty.set(true);

  // Enhance arrays with natural operations
  const enhanceArray = <U>(
    arraySignal: WritableSignal<U[]>
  ): EnhancedArraySignal<U> => {
    const enhanced = arraySignal as EnhancedArraySignal<U>;

    enhanced.push = (item: U) => {
      arraySignal.update((arr) => [...arr, item]);
      markDirty();
    };

    enhanced.removeAt = (index: number) => {
      arraySignal.update((arr) => arr.filter((_, i) => i !== index));
      markDirty();
    };

    enhanced.setAt = (index: number, value: U) => {
      arraySignal.update((arr) =>
        arr.map((item, i) => (i === index ? value : item))
      );
      markDirty();
    };

    enhanced.insertAt = (index: number, item: U) => {
      arraySignal.update((arr) => [
        ...arr.slice(0, index),
        item,
        ...arr.slice(index),
      ]);
      markDirty();
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
      markDirty();
    };

    enhanced.clear = () => {
      arraySignal.set([]);
      markDirty();
    };

    return enhanced;
  };

  // Recursively enhance all arrays in the state
  const enhanceArraysRecursively = (obj: Record<string, unknown>): void => {
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
        enhanceArraysRecursively(value as Record<string, unknown>);
      }
    }
  };

  // Enhance arrays in the state
  enhanceArraysRecursively(flattenedState as Record<string, unknown>);

  // Helper functions for nested paths
  const getNestedValue = (obj: DeepSignalify<T>, path: string): unknown => {
    const keys = parsePath(path);
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
        if (isSignal(current)) {
          current = (current as Signal<unknown>)();
        }
      } else {
        return undefined;
      }
    }

    return current;
  };

  const setNestedValue = (path: string, value: unknown): void => {
    const keys = parsePath(path);
    let current: unknown = flattenedState;

    for (let i = 0; i < keys.length - 1; i++) {
      current = (current as Record<string, unknown>)[keys[i]];
      if (!current) return;
    }

    const lastKey = keys[keys.length - 1];
    const target = (current as Record<string, unknown>)[lastKey];

    if (isSignal(target) && 'set' in target) {
      (target as WritableSignal<unknown>).set(value);
    }
  };

  const validate = async (field?: string): Promise<void> => {
    const errors: Record<string, string> = {};
    const asyncErrors: Record<string, string> = {};

    const fieldsToValidate = field ? [field] : Object.keys(validators);

    // Sync validation
    for (const fieldPath of fieldsToValidate) {
      const validator = validators[fieldPath];
      if (validator) {
        const value = getNestedValue(flattenedState, fieldPath);
        const error = validator(value);
        if (error) {
          errors[fieldPath] = error;
        }
      }
    }

    formSignals.errors.set(errors);

    // Async validation
    const asyncFieldsToValidate = field
      ? [field]
      : Object.keys(asyncValidators);

    for (const fieldPath of asyncFieldsToValidate) {
      const asyncValidator = asyncValidators[fieldPath];
      if (asyncValidator && (!field || field === fieldPath)) {
        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: true,
        }));

        try {
          const value = getNestedValue(flattenedState, fieldPath);
          const result = asyncValidator(value);

          let error: string | null;
          if (result instanceof Observable) {
            // Handle Observable
            error = await new Promise<string | null>((resolve) => {
              result.subscribe({
                next: (val) => resolve(val),
                error: () => resolve('Validation error'),
              });
            });
          } else {
            // Handle Promise
            error = await result;
          }

          if (error) {
            asyncErrors[fieldPath] = error;
          }
        } catch {
          asyncErrors[fieldPath] = 'Validation error';
        }

        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: false,
        }));
      }
    }

    formSignals.asyncErrors.set(asyncErrors);

    // Update validity
    const hasErrors = Object.keys(errors).length > 0;
    const hasAsyncErrors = Object.keys(asyncErrors).length > 0;
    const isValidating = Object.values(formSignals.asyncValidating()).some(
      (v) => v
    );

    formSignals.valid.set(!hasErrors && !hasAsyncErrors && !isValidating);
  };

  // Create computed signals for field errors
  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};

  // Create error signals for all defined validators
  [...Object.keys(validators), ...Object.keys(asyncValidators)].forEach(
    (fieldPath) => {
      fieldErrors[fieldPath] = computed(() => {
        const errors = formSignals.errors();
        return errors[fieldPath];
      });
      fieldAsyncErrors[fieldPath] = computed(() => {
        const errors = formSignals.asyncErrors();
        return errors[fieldPath];
      });
    }
  );

  // Create the form tree object
  const formTree: FormTree<T> = {
    // Flattened state access
    state: flattenedState,
    $: flattenedState,

    // Form signals
    ...formSignals,

    // Core methods
    unwrap: () => valuesTree.unwrap(),

    setValue: (field: string, value: unknown) => {
      setNestedValue(field, value);
      formSignals.touched.update((t) => ({ ...t, [field]: true }));
      markDirty();
      void validate(field);
    },

    setValues: (values: Partial<T>) => {
      valuesTree.update((v) => ({ ...v, ...values }));
      markDirty();
      void validate();
    },

    reset: () => {
      // Reset each field individually to maintain signal reactivity
      const resetSignals = <TReset extends Record<string, unknown>>(
        current: DeepSignalify<TReset>,
        initial: TReset
      ): void => {
        for (const [key, initialValue] of Object.entries(initial)) {
          const currentValue = (current as Record<string, unknown>)[key];

          if (isSignal(currentValue) && 'set' in currentValue) {
            (currentValue as WritableSignal<unknown>).set(initialValue);
          } else if (
            typeof initialValue === 'object' &&
            initialValue !== null &&
            !Array.isArray(initialValue) &&
            typeof currentValue === 'object' &&
            currentValue !== null &&
            !isSignal(currentValue)
          ) {
            resetSignals(
              currentValue as DeepSignalify<Record<string, unknown>>,
              initialValue as Record<string, unknown>
            );
          }
        }
      };

      resetSignals(flattenedState, initialValues);

      formSignals.errors.set({});
      formSignals.asyncErrors.set({});
      formSignals.touched.set({});
      formSignals.asyncValidating.set({});
      formSignals.dirty.set(false);
      formSignals.valid.set(true);
      formSignals.submitting.set(false);
    },

    submit: async <TResult>(
      submitFn: (values: T) => Promise<TResult>
    ): Promise<TResult> => {
      formSignals.submitting.set(true);

      try {
        await validate();

        if (!formSignals.valid()) {
          throw new Error('Form is invalid');
        }

        const currentValues = valuesTree.unwrap();
        const result = await submitFn(currentValues);
        return result;
      } finally {
        formSignals.submitting.set(false);
      }
    },

    validate,

    // Field helpers
    getFieldError: (field: string) =>
      fieldErrors[field] || computed(() => undefined),

    getFieldAsyncError: (field: string) =>
      fieldAsyncErrors[field] || computed(() => undefined),

    getFieldTouched: (field: string) =>
      computed(() => {
        const touched = formSignals.touched();
        return touched[field];
      }),

    isFieldValid: (field: string) =>
      computed(() => {
        const errors = formSignals.errors();
        const asyncErrors = formSignals.asyncErrors();
        const asyncValidating = formSignals.asyncValidating();
        return !errors[field] && !asyncErrors[field] && !asyncValidating[field];
      }),

    isFieldAsyncValidating: (field: string) =>
      computed(() => {
        const asyncValidating = formSignals.asyncValidating();
        return asyncValidating[field];
      }),

    // Direct access
    fieldErrors,
    fieldAsyncErrors,

    // Keep values tree for backward compatibility
    values: valuesTree,
  };

  return formTree;
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
// VALIDATORS
// ============================================

export const validators = {
  required:
    (message = 'Required') =>
    (value: unknown) =>
      !value ? message : null,

  email:
    (message = 'Invalid email') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !strValue.includes('@') ? message : null;
    },

  minLength: (min: number) => (value: unknown) => {
    const strValue = value as string;
    return strValue && strValue.length < min ? `Min ${min} characters` : null;
  },

  pattern:
    (regex: RegExp, message = 'Invalid format') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !regex.test(strValue) ? message : null;
    },
};

export const asyncValidators = {
  unique:
    (
      checkFn: (value: unknown) => Promise<boolean>,
      message = 'Already exists'
    ) =>
    async (value: unknown) => {
      if (!value) return null;
      const exists = await checkFn(value);
      return exists ? message : null;
    },
};

// ============================================
// RXJS BRIDGE
// ============================================

export function toObservable<T>(signal: Signal<T>): Observable<T> {
  return new Observable((subscriber) => {
    try {
      const effectRef = effect(() => {
        subscriber.next(signal());
      });
      return () => effectRef.destroy();
    } catch {
      // Fallback for test environment without injection context
      subscriber.next(signal());
      return () => {
        // No cleanup needed for single emission
      };
    }
  });
}

// ============================================
// AUDIT MIDDLEWARE
// ============================================

export interface AuditEntry<T = unknown> {
  timestamp: number;
  changes: Partial<T>;
  metadata?: {
    userId?: string;
    source?: string;
    description?: string;
  };
}

export function createAuditMiddleware<T>(
  auditLog: AuditEntry<T>[],
  getMetadata?: () => AuditEntry<T>['metadata']
): Middleware<T> {
  return {
    id: 'audit',
    after: (action: string, payload: unknown, oldState: T, newState: T) => {
      const changes = getChanges(oldState, newState);
      if (Object.keys(changes).length > 0) {
        auditLog.push({
          timestamp: Date.now(),
          changes,
          metadata: getMetadata?.(),
        });
      }
    },
  };
}

function getChanges<T>(oldState: T, newState: T): Partial<T> {
  const changes: Record<string, unknown> = {};

  for (const key in newState) {
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes as Partial<T>;
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [SignalValueDirective];
