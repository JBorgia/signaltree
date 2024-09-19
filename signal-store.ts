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

// SignalStore type with unwrap and update methods
export type SignalStore<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]> // If T[K] is an array, the property is a WritableSignal of U[].
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK> // If T[K] extends Signal, the property is a WritableSignal of TK.
      : SignalStore<T[K]> // Otherwise, it's a nested SignalStore.
    : WritableSignal<T[K]>; // If T[K] is not an object, it is a WritableSignal of T[K].
} & {
  unwrap(): T;
  update(partialObj: Partial<T>): void;
};

// Helper function to add unwrap and update methods to a store
function enhanceStore<T>(store: SignalStore<T>): SignalStore<T> {
  store.unwrap = () => {
    const unwrappedObject: any = {};
    for (const key in store) {
      const value = store[key as keyof SignalStore<T>];
      if (isSignal(value)) {
        unwrappedObject[key] = value();
      } else if (typeof value === 'object' && value !== null) {
        unwrappedObject[key] = (value as SignalStore<any>).unwrap();
      } else {
        unwrappedObject[key] = value;
      }
    }
    return unwrappedObject as T;
  };

  store.update = (partialObj: Partial<T>) => {
    for (const key in partialObj) {
      if (!Object.prototype.hasOwnProperty.call(partialObj, key)) continue;

      const partialValue = partialObj[key];
      const storeValue = store[key as keyof SignalStore<T>];

      if (isSignal(storeValue)) {
        (storeValue as WritableSignal<any>).set(partialValue);
      } else if (
        typeof storeValue === 'object' &&
        storeValue !== null &&
        partialValue !== null &&
        typeof partialValue === 'object'
      ) {
        (storeValue as SignalStore<any>).update(partialValue as any);
      }
    }
  };

  return store;
}

// Function to create a signal store from an object or array, wrapping values in signals as necessary.
function create<T, P extends keyof T>(
  obj:
    | Required<T>
    | { [K in keyof T]: SignalValue<T[K]> | SignalStore<T[K]> }
    | ArrayLike<SignalValue<T[P]> | SignalStore<T[P]>>
): SignalStore<T> {
  const store: Partial<SignalStore<T>> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isObj = (v: any) => typeof v === 'object' && v !== null;

    store[key as P] = (
      isObj(value) && !Array.isArray(value) && !isSignal(value)
        ? create(
            value as
              | { [K in keyof T]: SignalValue<T[K]> | SignalStore<T[K]> }
              | ArrayLike<SignalValue<T[P]> | SignalStore<T[P]>>
          ) // Recursive call
        : isSignal(value)
        ? value
        : (signal(value, { equal }) as SignalStore<T>[P])
    ) as SignalStore<T>[P]; // Ensure correct type
  }

  // Enhance the store with unwrap and update methods
  return enhanceStore(store as SignalStore<T>);
}

/***********************************************************************
 * INSTRUCTIONS/WARNINGS:
 * 1) This will recursively wrap each field into SignalStores and should
 * only be used for simple objects without any self-referenced fields
 * (for example, ArcGIS Layers and Objects).
 *
 * You can make anything into a signal and that will make it the end
 * of the deep wrapping. It won't wrap a signal in a signal.
 *
 * NOTE, if you want to have the signal utilize the same equal()
 * functionality that the signalStore uses by default for deep checking
 * arrays, you should use the 'terminal' function from the store rather
 * than the 'signal' from '@angular/core' when wrapping the end object
 * or create your own equal function to ensure proper emissions when
 * changes to your final object occur.
 *
 * 2) The store cannot be mutated in shape once created. Much like at an
 * actual store, the shelves aren't added/removed, but the inventory does
 * change. Similarly, the values can be updated, but fields cannot be
 * removed or added. Types used in the store cannot have optional (?) fields.
 * However, Partial<> can still be used.
 *
 * IN SUMMARY: ALL VALUES THAT WILL EXIST MUST EXIST. See example.ts
 ***********************************************************************/
export function signalStore<T, P extends keyof T>(
  obj: Required<T>
): SignalStore<Required<T>> {
  return create<Required<T>, P>(obj);
}
