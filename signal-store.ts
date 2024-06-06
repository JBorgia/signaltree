import { Signal, WritableSignal, isSignal, signal } from '@angular/core';
import isEqual from 'lodash-es/isEqual';

export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? isEqual(a, b) : a === b;
}

type SimpleSignalValue = string | number | boolean;
type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

export type SignalStore<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK>
      : SignalStore<T[K]>
    : WritableSignal<T[K]>;
} & {
  [K: string]: T[] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[] extends object
    ? T[] extends Signal<infer TK>
      ? WritableSignal<TK>
      : SignalStore<T[]>
    : WritableSignal<T[]>;
};

function create<T, P extends keyof T>(
  obj:
    | { [s: string]: SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]> }
    | ArrayLike<SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]>>
): SignalStore<T> {
  return Object.entries<SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]>>(
    obj
  ).reduce(
    (
      acc,
      [key, value]: [
        string,
        SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]> | unknown
      ]
    ) => {
      // eslint-disable-next-line no-extra-boolean-cast
      acc[key as P] = (
        typeof value === 'object' && !Array.isArray(value) && !isSignal(value) // Check if the value is an instance of Signal
          ? (create(
              value as
                | {
                    [s: string]:
                      | SignalValue<T[P][keyof T[P]]>
                      | SignalStore<T[P][keyof T[P]][keyof T[P][keyof T[P]]]>;
                  }
                | ArrayLike<
                    | SignalValue<T[P][keyof T[P]]>
                    | SignalStore<T[P][keyof T[P]][keyof T[P][keyof T[P]]]>
                  >
            ) as SignalStore<T[P]>)
          : isSignal(value) // Check if the value is an instance of Signal
          ? value // unwrap the Signal into an object
          : signal(value as SignalValue<T[P]>, { equal })
      ) as SignalStore<T>[P];
      return acc;
    },
    {} as SignalStore<T>
  );
}

export function unwrapSignalStore<T>(store: SignalStore<T>): T {
  const unwrappedObject: any = {};

  for (const key in store) {
    const value = store[key];

    if (isSignal(value)) {
      unwrappedObject[key] = value();
    } else if (typeof value === 'object' && value !== null) {
      unwrappedObject[key] = unwrapSignalStore(value as SignalStore<any>);
    } else {
      unwrappedObject[key] = value;
    }
  }

  return unwrappedObject as T;
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
 * 2) The store cannot be mutated in shape once created. Much like at an
 * actual store, the shelves aren't added/removed, but the inventory does
 * change. Similarly, the values can be updated, but fields cannot be
 * removed or added. Types used in the store cannot have optional fields.
 * However, Partial<> can still be used.
 ***********************************************************************/
export function signalStore<T, P extends keyof T>(
  obj: Required<T>
): SignalStore<Required<T>> {
  const store = create<Required<T>, P>(
    obj as
      | ArrayLike<
          | SignalValue<Required<T>[P]>
          | SignalStore<Required<T>[P][keyof Required<T>[P]]>
        >
      | {
          [s: string]:
            | SignalValue<Required<T>[P]>
            | SignalStore<Required<T>[P][keyof Required<T>[P]]>;
        }
  );

  return store;
}
