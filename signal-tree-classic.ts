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
type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

// SignalTree type that is callable like a signal
export type SignalTree<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
  ? WritableSignal<U[]>
  : T[K] extends object
  ? T[K] extends Signal<infer TK>
  ? WritableSignal<TK>
  : SignalTree<T[K]>
  : WritableSignal<T[K]>;
} & {
  (): T; // Make it callable to unwrap
  update(updater: (current: T) => Partial<T>): void;
};

// Helper function to make a tree node callable and add update method
function enhanceTree<T>(tree: any): SignalTree<T> {
  // Create a callable function that returns the unwrapped value
  const callableTree = function () {
    const unwrappedObject: any = {};

    for (const key in tree) {
      // Skip function properties
      if (typeof tree[key] === 'function' && key !== 'update') continue;

      const value = tree[key];

      if (isSignal(value)) {
        unwrappedObject[key] = value();
      } else if (typeof value === 'object' && value !== null) {
        // Check if it's a SignalTree (has the callable property)
        if (typeof value === 'function' && value.update) {
          unwrappedObject[key] = value(); // Call the SignalTree to unwrap
        } else {
          unwrappedObject[key] = value;
        }
      } else {
        unwrappedObject[key] = value;
      }
    }

    return unwrappedObject as T;
  };

  // Copy all properties from the original tree to the callable function
  for (const key in tree) {
    callableTree[key] = tree[key];
  }

  // Add the update method
  callableTree.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = callableTree();
    const partialObj = updater(currentValue);

    for (const key in partialObj) {
      if (!Object.prototype.hasOwnProperty.call(partialObj, key)) continue;

      const partialValue = partialObj[key as keyof typeof partialObj];
      const treeValue = (callableTree as any)[key];

      if (isSignal(treeValue)) {
        (treeValue as WritableSignal<any>).set(partialValue);
      } else if (
        typeof treeValue === 'function' &&
        treeValue.update &&
        partialValue !== null &&
        typeof partialValue === 'object'
      ) {
        // It's a SignalTree node
        treeValue.update(() => partialValue as any);
      }
    }
  };

  return callableTree as SignalTree<T>;
}

// Function to create a signal tree from an object or array
function create<T, P extends keyof T>(
  obj:
    | Required<T>
    | { [K in keyof T]: SignalValue<T[K]> | SignalTree<T[K]> }
    | ArrayLike<SignalValue<T[P]> | SignalTree<T[P]>>
): SignalTree<T> {
  const tree: any = {};

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
    ) as SignalTree<T>[P];
  }

  // Enhance the tree to be callable with update method
  return enhanceTree<T>(tree);
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

// Export the main function with a cleaner name
export { signalTree as signalStore };