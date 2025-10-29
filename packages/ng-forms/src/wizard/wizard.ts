import { computed, Signal, signal } from '@angular/core';
import { createFormTree } from '@signaltree/ng-forms';

import type { FormTree, FormTreeOptions } from '@signaltree/ng-forms';
/**
 * Defines a step in a wizard form
 */
export interface FormStep<T extends Record<string, unknown>> {
  /** Fields visible in this step */
  fields: Array<keyof T | string>;
  /** Optional validation function to run before proceeding to next step */
  validate?: (form: FormTree<T>) => Promise<boolean> | boolean;
  /** Optional function to determine if this step can be skipped */
  canSkip?: (values: T) => boolean;
}

/**
 * Creates a wizard form with multi-step navigation.
 * Manages step visibility, navigation, and per-step validation.
 *
 * @param steps - Array of form steps defining fields and validation
 * @param initialValues - Initial form values
 * @param config - Optional form tree configuration
 * @returns Extended FormTree with wizard navigation methods
 *
 * @example
 * ```typescript
 * const wizard = createWizardForm(
 *   [
 *     { fields: ['email', 'password'] },
 *     { fields: ['firstName', 'lastName'], validate: async (form) => form.valid() },
 *     { fields: ['address', 'city', 'zip'] }
 *   ],
 *   { email: '', password: '', firstName: '', lastName: '', address: '', city: '', zip: '' }
 * );
 *
 * await wizard.nextStep(); // Move to step 2
 * wizard.previousStep();   // Back to step 1
 * await wizard.goToStep(2); // Jump to step 3
 * ```
 */
export function createWizardForm<T extends Record<string, unknown>>(
  steps: FormStep<T>[],
  initialValues: T,
  config: FormTreeOptions<T> = {}
): FormTree<T> & {
  currentStep: Signal<number>;
  nextStep: () => Promise<boolean>;
  previousStep: () => void;
  goToStep: (index: number) => Promise<boolean>;
  canGoToStep: (index: number) => boolean;
  isFieldVisible: (field: keyof T | string) => Signal<boolean>;
} {
  const formTree = createFormTree(initialValues, config);
  const currentStepSignal = signal(0);

  const visibleFields = computed(() => {
    const step = steps[currentStepSignal()];
    if (!step) {
      return new Set<string>();
    }
    return new Set(step.fields.map((field) => String(field)));
  });

  const canGoToStep = (index: number) => index >= 0 && index < steps.length;

  const goToStep = async (index: number) => {
    if (!canGoToStep(index)) {
      return false;
    }
    if (index === currentStepSignal()) {
      return true;
    }
    currentStepSignal.set(index);
    return true;
  };

  const findNextStep = (startIndex: number) => {
    let candidate = startIndex;
    while (candidate < steps.length) {
      const candidateStep = steps[candidate];
      if (
        !candidateStep?.canSkip ||
        !candidateStep.canSkip(formTree.unwrap())
      ) {
        break;
      }
      candidate++;
    }
    return candidate;
  };

  const nextStep = async () => {
    const currentIndex = currentStepSignal();
    const currentStep = steps[currentIndex];
    if (!currentStep) {
      return false;
    }

    if (currentStep.validate) {
      const result = await currentStep.validate(formTree);
      if (!result) {
        return false;
      }
    }

    const nextIndex = findNextStep(currentIndex + 1);
    if (!canGoToStep(nextIndex) || nextIndex <= currentIndex) {
      return false;
    }

    currentStepSignal.set(nextIndex);
    return true;
  };

  const previousStep = () => {
    const currentIndex = currentStepSignal();
    currentStepSignal.set(Math.max(0, currentIndex - 1));
  };

  const isFieldVisible = (field: keyof T | string) =>
    computed(() => {
      const fields = visibleFields();
      if (fields.size === 0) {
        return true;
      }
      return fields.has(String(field));
    });

  return {
    ...formTree,
    currentStep: currentStepSignal.asReadonly(),
    nextStep,
    previousStep,
    goToStep,
    canGoToStep,
    isFieldVisible,
  };
}
