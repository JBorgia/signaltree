import { Signal, signal } from '@angular/core';
import { deepClone, snapshotsEqual } from '@signaltree/shared';

// Local type definition to avoid circular imports in secondary entry points
interface FormTree<T extends Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any; // FormGroup
  unwrap(): T;
  destroy(): void;
  setValues(values: Partial<T>): void;
}

/**
 * Form history state structure
 */
export interface FormHistory<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Enhances a FormTree with undo/redo capabilities.
 * Provides form-specific history management with capacity limits and change tracking.
 *
 * @param formTree - The form tree to enhance
 * @param options - Configuration options
 * @param options.capacity - Maximum number of history entries (default: 10)
 * @returns Extended FormTree with undo, redo, and history access
 *
 * @example
 * ```typescript
 * const form = createFormTree({ name: '', email: '' });
 * const formWithHistory = withFormHistory(form, { capacity: 20 });
 *
 * form.$.name.set('John');
 * form.$.email.set('john@example.com');
 *
 * formWithHistory.undo(); // Reverts email change
 * formWithHistory.undo(); // Reverts name change
 * formWithHistory.redo(); // Reapplies name change
 *
 * console.log(formWithHistory.history().past.length); // 1
 * ```
 */
export function withFormHistory<T extends Record<string, unknown>>(
  formTree: FormTree<T>,
  options: { capacity?: number } = {}
): FormTree<T> & {
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  history: Signal<FormHistory<T>>;
} {
  const capacity = Math.max(1, options.capacity ?? 10);
  const historySignal = signal<FormHistory<T>>({
    past: [],
    present: deepClone(formTree.form.getRawValue() as T),
    future: [],
  });

  let recording = true;
  let suppressUpdates = 0;
  let internalHistory: FormHistory<T> = {
    past: [],
    present: deepClone(formTree.form.getRawValue() as T),
    future: [],
  };

  const subscription = formTree.form.valueChanges.subscribe(() => {
    if (suppressUpdates > 0) {
      suppressUpdates--;
      return;
    }

    if (!recording) {
      internalHistory = {
        ...internalHistory,
        present: deepClone(formTree.form.getRawValue() as T),
      };
      return;
    }
    const snapshot = deepClone(formTree.form.getRawValue() as T);
    if (snapshotsEqual(internalHistory.present, snapshot)) {
      internalHistory = {
        ...internalHistory,
        present: snapshot,
      };
      historySignal.set(cloneHistory(internalHistory));
      return;
    }
    const updatedPast = [...internalHistory.past, internalHistory.present];
    if (updatedPast.length > capacity) {
      updatedPast.shift();
    }
    internalHistory = {
      past: updatedPast,
      present: snapshot,
      future: [],
    };
    historySignal.set(cloneHistory(internalHistory));
  });

  const originalDestroy = formTree.destroy;
  formTree.destroy = () => {
    subscription.unsubscribe();
    originalDestroy();
  };

  const undo = () => {
    const history = historySignal();
    if (history.past.length === 0) {
      return;
    }
    const previous = deepClone(history.past[history.past.length - 1]);
    recording = false;
    suppressUpdates++;
    formTree.setValues(previous);
    recording = true;
    internalHistory = {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    };
    historySignal.set(cloneHistory(internalHistory));
  };

  const redo = () => {
    const history = historySignal();
    if (history.future.length === 0) {
      return;
    }
    const next = deepClone(history.future[0]);
    recording = false;
    suppressUpdates++;
    formTree.setValues(next);
    recording = true;
    internalHistory = {
      past: [...history.past, history.present],
      present: next,
      future: history.future.slice(1),
    };
    historySignal.set(cloneHistory(internalHistory));
  };

  const clearHistory = () => {
    internalHistory = {
      past: [],
      present: deepClone(formTree.form.getRawValue() as T),
      future: [],
    };
    historySignal.set(cloneHistory(internalHistory));
  };

  function cloneHistory(state: FormHistory<T>): FormHistory<T> {
    return {
      past: state.past.map((entry) => deepClone(entry)),
      present: deepClone(state.present),
      future: state.future.map((entry) => deepClone(entry)),
    };
  }

  return Object.assign(formTree, {
    undo,
    redo,
    clearHistory,
    history: historySignal.asReadonly(),
  });
}
