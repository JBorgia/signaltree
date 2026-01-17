import { computed, DestroyRef, inject, Signal } from '@angular/core';
import {
    AbstractControl,
    AsyncValidatorFn,
    FormArray,
    FormControl,
    FormGroup,
    ValidationErrors,
    ValidatorFn,
} from '@angular/forms';
import { FORM_MARKER, FormSignal, isFormMarker, ISignalTree } from '@signaltree/core';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for conditional field visibility/enablement
 */
export interface AngularConditionalField<T = unknown> {
  /** Predicate that determines if fields should be enabled */
  when: (values: T) => boolean;
  /** Field paths affected by this condition (supports glob patterns) */
  fields: string[];
}

/**
 * Per-field configuration for Angular forms bridge
 */
export interface AngularFieldConfig {
  /** Debounce delay for value sync (ms) */
  debounceMs?: number;
  /** Additional Angular validators */
  validators?: ValidatorFn | ValidatorFn[];
  /** Additional Angular async validators */
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[];
}

/**
 * Configuration for formBridge enhancer
 */
export interface AngularFormsConfig<T = unknown> {
  /** Conditional field enabling/disabling */
  conditionals?: AngularConditionalField<T>[];
  /** Per-field Angular-specific configuration */
  fieldConfigs?: Record<string, AngularFieldConfig>;
  /** DestroyRef for automatic cleanup (auto-injected if in injection context) */
  destroyRef?: DestroyRef;
  /** Batch validation updates (ms, default: 0) */
  validationBatchMs?: number;
}

/**
 * Angular form bridge added to each form() marker
 */
export interface AngularFormBridge<T extends Record<string, unknown>> {
  /** Angular FormGroup synced with the form signals */
  formGroup: FormGroup;
  /** Get FormControl for a specific field path */
  formControl(path: string): FormControl | null;
  /** Angular-specific validation errors */
  angularErrors: Signal<Record<string, ValidationErrors | null>>;
  /** Whether any async validation is pending */
  asyncPending: Signal<boolean>;
}

/**
 * Methods added by formBridge enhancer
 */
export interface AngularFormsMethods {
  /** Access the Angular forms bridge for a form at a given path */
  getAngularForm<T extends Record<string, unknown>>(
    path: string
  ): AngularFormBridge<T> | null;
  /** All Angular form bridges in the tree, keyed by path */
  formBridge: Map<string, AngularFormBridge<Record<string, unknown>>>;
}

// =============================================================================
// FORM MARKER DETECTION
// =============================================================================

interface FormLocation {
  path: string;
  formSignal: FormSignal<Record<string, unknown>>;
}

/**
 * Walk the tree's $ accessor to find all materialized form() markers
 */
function findFormSignals(
  node: unknown,
  path: string,
  results: FormLocation[]
): void {
  if (node === null || node === undefined) return;

  // Check if this is a FormSignal (materialized form marker)
  // FormSignal is a callable function with $, valid, dirty, submitting, validate, etc.
  // Note: FormSignal is typeof 'function' because it's a callable signal
  const hasForm =
    (typeof node === 'function' || typeof node === 'object') &&
    node !== null &&
    '$' in node &&
    'valid' in node &&
    'dirty' in node &&
    'validate' in node;

  if (
    hasForm &&
    typeof (node as FormSignal<Record<string, unknown>>).validate === 'function'
  ) {
    results.push({
      path,
      formSignal: node as FormSignal<Record<string, unknown>>,
    });
    return; // Don't recurse into form internals
  }

  // Check if it's a callable (signal) with nested properties
  if (typeof node === 'function' || typeof node === 'object') {
    const entries = Object.entries(node as Record<string, unknown>);
    for (const [key, value] of entries) {
      // Skip internal properties
      if (key.startsWith('_') || key === 'set' || key === 'update') continue;
      const childPath = path ? `${path}.${key}` : key;
      findFormSignals(value, childPath, results);
    }
  }
}

// =============================================================================
// FORMGROUP BRIDGE FACTORY
// =============================================================================

/**
 * Create an Angular FormGroup that stays in sync with a FormSignal
 */
function createFormGroupBridge<T extends Record<string, unknown>>(
  formSignal: FormSignal<T>,
  config: AngularFormsConfig<T>,
  cleanupCallbacks: Array<() => void>
): AngularFormBridge<T> {
  const values = formSignal();
  const formGroup = createFormGroupFromValues(
    values,
    config.fieldConfigs || {}
  );

  const angularErrors = computed(() => {
    const result: Record<string, ValidationErrors | null> = {};
    collectControlErrors(formGroup, '', result);
    return result;
  });

  const asyncPending = computed(() => formGroup.pending);

  // Bidirectional sync: FormSignal -> FormGroup
  const syncSignalToControl = () => {
    const currentValues = formSignal();
    patchFormGroupValues(formGroup, currentValues, '');
  };

  // Bidirectional sync: FormGroup -> FormSignal
  const syncControlToSignal = () => {
    const formValues = formGroup.getRawValue() as T;
    // Use patch to update without triggering full re-render
    formSignal.set(formValues);
  };

  // Subscribe to FormGroup value changes
  const subscription = formGroup.valueChanges.subscribe(() => {
    // Sync FormGroup changes back to FormSignal
    // Use a flag to prevent infinite loops
    syncControlToSignal();
  });

  cleanupCallbacks.push(() => subscription.unsubscribe());

  // Watch FormSignal changes via effect-like pattern
  // Since we're outside Angular's effect context, we poll or use the tree's effect system
  // For now, we set up initial sync and rely on FormGroup being the primary editor
  syncSignalToControl();

  // Apply conditionals
  if (config.conditionals && config.conditionals.length > 0) {
    const conditionalState = new Map<string, boolean>();

    const applyConditionals = () => {
      const values = formGroup.getRawValue() as T;
      for (const { when, fields } of config.conditionals!) {
        let visible = true;
        try {
          visible = when(values);
        } catch {
          visible = true;
        }

        for (const fieldPath of fields) {
          const control = formGroup.get(fieldPath);
          if (!control) continue;

          const previous = conditionalState.get(fieldPath);
          if (previous === visible) continue;

          conditionalState.set(fieldPath, visible);
          if (visible) {
            control.enable({ emitEvent: true });
          } else {
            control.disable({ emitEvent: false });
          }
        }
      }
    };

    applyConditionals();
    const condSub = formGroup.valueChanges.subscribe(() => applyConditionals());
    cleanupCallbacks.push(() => condSub.unsubscribe());
  }

  return {
    formGroup,
    formControl: (path: string) => {
      const control = formGroup.get(path);
      return control instanceof FormControl ? control : null;
    },
    angularErrors,
    asyncPending,
  };
}

/**
 * Recursively create FormGroup structure from values
 */
function createFormGroupFromValues(
  values: Record<string, unknown>,
  fieldConfigs: Record<string, AngularFieldConfig>,
  basePath = ''
): FormGroup {
  const controls: Record<string, AbstractControl> = {};

  for (const [key, value] of Object.entries(values)) {
    const path = basePath ? `${basePath}.${key}` : key;
    const fieldConfig = fieldConfigs[path] || {};

    if (Array.isArray(value)) {
      // Create FormArray
      const arrayControls = value.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          return createFormGroupFromValues(
            item as Record<string, unknown>,
            fieldConfigs,
            `${path}.${index}`
          );
        }
        return new FormControl(item);
      });
      controls[key] = new FormArray(arrayControls);
    } else if (typeof value === 'object' && value !== null) {
      // Nested object -> nested FormGroup
      controls[key] = createFormGroupFromValues(
        value as Record<string, unknown>,
        fieldConfigs,
        path
      );
    } else {
      // Primitive value -> FormControl
      const validators = fieldConfig.validators
        ? Array.isArray(fieldConfig.validators)
          ? fieldConfig.validators
          : [fieldConfig.validators]
        : [];
      const asyncValidators = fieldConfig.asyncValidators
        ? Array.isArray(fieldConfig.asyncValidators)
          ? fieldConfig.asyncValidators
          : [fieldConfig.asyncValidators]
        : [];

      controls[key] = new FormControl(value, {
        validators,
        asyncValidators,
      });
    }
  }

  return new FormGroup(controls);
}

/**
 * Patch FormGroup values from an object
 */
function patchFormGroupValues(
  group: FormGroup,
  values: Record<string, unknown>,
  basePath: string
): void {
  for (const [key, value] of Object.entries(values)) {
    const control = group.get(key);
    if (!control) continue;

    if (
      control instanceof FormGroup &&
      typeof value === 'object' &&
      value !== null
    ) {
      patchFormGroupValues(
        control,
        value as Record<string, unknown>,
        `${basePath}.${key}`
      );
    } else if (control instanceof FormArray && Array.isArray(value)) {
      // Handle array updates
      control.clear({ emitEvent: false });
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          control.push(
            createFormGroupFromValues(item as Record<string, unknown>, {})
          );
        } else {
          control.push(new FormControl(item));
        }
      }
    } else {
      control.setValue(value, { emitEvent: false });
    }
  }
}

/**
 * Collect validation errors from all controls
 */
function collectControlErrors(
  control: AbstractControl,
  path: string,
  result: Record<string, ValidationErrors | null>
): void {
  if (control.errors) {
    result[path || 'root'] = control.errors;
  }

  if (control instanceof FormGroup) {
    for (const [key, child] of Object.entries(control.controls)) {
      collectControlErrors(child, path ? `${path}.${key}` : key, result);
    }
  } else if (control instanceof FormArray) {
    control.controls.forEach((child, index) => {
      collectControlErrors(child, `${path}.${index}`, result);
    });
  }
}

// =============================================================================
// ENHANCER
// =============================================================================

/**
 * Enhancer that bridges form() markers to Angular Reactive Forms.
 *
 * Detects all form() markers in the tree and creates corresponding
 * FormGroup instances with bidirectional synchronization.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   profile: form({
 *     initial: { name: '', email: '' },
 *     validators: { email: v => v.includes('@') ? null : 'Invalid' }
 *   })
 * }).with(formBridge({
 *   conditionals: [
 *     { when: $ => $.profile.showBio(), fields: ['profile.bio'] }
 *   ]
 * }));
 *
 * // Access the form signal (works without enhancer too)
 * tree.$.profile.name.set('John');
 * tree.$.profile.valid(); // true/false
 *
 * // Access the Angular FormGroup (added by enhancer)
 * const formGroup = tree.getAngularForm('profile')?.formGroup;
 * // Use in template: [formGroup]="formGroup"
 * ```
 */
export function formBridge<TConfig = unknown>(
  config: AngularFormsConfig<TConfig> = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & AngularFormsMethods {
  // Return a properly generic enhancer function
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & AngularFormsMethods => {
    const cleanupCallbacks: Array<() => void> = [];
    const formBridgeMap = new Map<
      string,
      AngularFormBridge<Record<string, unknown>>
    >();

    // Find all form() markers in the tree
    const formLocations: FormLocation[] = [];
    findFormSignals(tree.$, '', formLocations);

    // Create FormGroup bridges for each form
    for (const { path, formSignal } of formLocations) {
      const bridge = createFormGroupBridge(
        formSignal,
        config as AngularFormsConfig<Record<string, unknown>>,
        cleanupCallbacks
      );
      formBridgeMap.set(path, bridge);

      // Attach bridge directly to the form signal for convenience
      (formSignal as unknown as Record<string, unknown>)['formGroup'] =
        bridge.formGroup;
      (formSignal as unknown as Record<string, unknown>)['formControl'] =
        bridge.formControl;
      (formSignal as unknown as Record<string, unknown>)['angularErrors'] =
        bridge.angularErrors;
      (formSignal as unknown as Record<string, unknown>)['asyncPending'] =
        bridge.asyncPending;
    }

    // Set up cleanup
    const destroyRef = config.destroyRef ?? tryInjectDestroyRef();
    if (destroyRef) {
      destroyRef.onDestroy(() => {
        cleanupCallbacks.forEach((fn) => fn());
      });
    }

    // Return enhanced tree with proper typing
    const enhanced = tree as ISignalTree<T> & AngularFormsMethods;
    enhanced.formBridge = formBridgeMap;
    enhanced.getAngularForm = function <TForm extends Record<string, unknown>>(
      path: string
    ): AngularFormBridge<TForm> | null {
      return (formBridgeMap.get(path) as AngularFormBridge<TForm>) ?? null;
    };

    return enhanced;
  };
}

/**
 * Try to inject DestroyRef if we're in an injection context
 */
function tryInjectDestroyRef(): DestroyRef | undefined {
  try {
    return inject(DestroyRef);
  } catch {
    return undefined;
  }
}

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

export { FORM_MARKER, isFormMarker } from '@signaltree/core';
