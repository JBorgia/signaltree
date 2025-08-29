// ./libs/core/src/tree/signal-tree.ts
import { Signal, WritableSignal, isSignal, signal } from '@angular/core';
import isEqual from 'lodash-es/isEqual';

// Function to check equality of two values, with special handling for arrays.
export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? isEqual(a, b) : a === b;
}

// Type alias for values that can be used in signals: strings, numbers, or booleans.
type SimpleSignalValue = string | number | boolean;

// Conditional type to determine the value type of a signal.
// If T is an array-like type, it should be an array of SimpleSignalValue.
// Otherwise, it is a SimpleSignalValue.
type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

// SignalTree type with unwrap and update methods
export type SignalTree<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK>
      : SignalTree<T[K]>
    : WritableSignal<T[K]>;
} & {
  unwrap(): T;
  update(updater: (current: T) => Partial<T>): void;
  set(partial: Partial<T>): void;
};

// Helper function to add unwrap and update methods to a tree
function enhanceTree<T>(tree: SignalTree<T>): SignalTree<T> {
  tree.unwrap = () => {
    const unwrappedObject: any = {};

    for (const key in tree) {
      const value = tree[key as keyof SignalTree<T>];

      if (isSignal(value)) {
        unwrappedObject[key] = value();
      } else if (typeof value === 'object' && value !== null) {
        const nestedUnwrapped = (value as SignalTree<any>).unwrap();
        unwrappedObject[key] = nestedUnwrapped;
      } else {
        unwrappedObject[key] = value;
      }
    }

    delete unwrappedObject.unwrap;
    delete unwrappedObject.update;
    return unwrappedObject as T;
  };

  tree.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = tree.unwrap();
    const partialObj = updater(currentValue);

    for (const key in partialObj) {
      if (!Object.prototype.hasOwnProperty.call(partialObj, key)) continue;

      const partialValue = partialObj[key];
      const treeValue = tree[key as keyof SignalTree<T>];

      if (isSignal(treeValue)) {
        (treeValue as WritableSignal<any>).set(partialValue);
      } else if (
        typeof treeValue === 'object' &&
        treeValue !== null &&
        partialValue !== null &&
        typeof partialValue === 'object'
      ) {
        (treeValue as SignalTree<any>).update(() => partialValue as any);
      }
    }
  };

  tree.set = (partial: Partial<T>) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Set must be called with a partial object');
    }

    for (const key in partial) {
      if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;

      const value = partial[key as keyof typeof partial];
      const treeValue = tree[key as keyof SignalTree<T>];

      if (isSignal(treeValue)) {
        (treeValue as WritableSignal<any>).set(value);
      } else if (
        typeof treeValue === 'function' &&
        treeValue.set &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        // It's a nested SignalTree node - recursive set
        treeValue.set(value as any);
      }
    }
  };

  return tree;
}

// Function to create a signal tree from an object or array, wrapping values in signals as necessary.
function create<T, P extends keyof T>(
  obj:
    | Required<T>
    | { [K in keyof T]: SignalValue<T[K]> | SignalTree<T[K]> }
    | ArrayLike<SignalValue<T[P]> | SignalTree<T[P]>>
): SignalTree<T> {
  const tree: Partial<SignalTree<T>> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isObj = (v: any) => typeof v === 'object' && v !== null;

    tree[key as P] = (
      isObj(value) && !Array.isArray(value) && !isSignal(value)
        ? create(
            value as
              | { [K in keyof T]: SignalValue<T[K]> | SignalTree<T[K]> }
              | ArrayLike<SignalValue<T[P]> | SignalTree<T[P]>>
          ) // Recursive call
        : isSignal(value)
        ? value
        : (signal(value, { equal }) as SignalTree<T>[P])
    ) as SignalTree<T>[P]; // Ensure correct type
  }

  // Enhance the tree with unwrap and update methods
  return enhanceTree(tree as SignalTree<T>);
}

/***********************************************************************
 * INSTRUCTIONS/WARNINGS:
 * 1) This will recursively wrap each field into SignalTrees and should
 * only be used for simple objects without any self-referenced fields
 * (for example, ArcGIS Layers and Objects).
 *
 * You can make anything into a signal and that will make it the end
 * of the deep wrapping. It won't wrap a signal in a signal.
 *
 * NOTE, if you want to have the signal utilize the same equal()
 * functionality that the signalTree uses by default for deep checking
 * arrays, you should use the 'terminal' function from the tree rather
 * than the 'signal' from '@angular/core' when wrapping the end object
 * or create your own equal function to ensure proper emissions when
 * changes to your final object occur.
 *
 * 2) The tree cannot be mutated in shape once created. Much like at an
 * actual tree, the shelves aren't added/removed, but the inventory does
 * change. Similarly, the values can be updated, but fields cannot be
 * removed or added. Types used in the tree cannot have optional (?) fields.
 * However, Partial<> can still be used.
 *
 * IN SUMMARY: ALL VALUES THAT WILL EXIST MUST EXIST. See example.ts
 ***********************************************************************/
export function signalTree<T, P extends keyof T>(
  obj: Required<T>
): SignalTree<Required<T>> {
  return create<Required<T>, P>(obj);
}
