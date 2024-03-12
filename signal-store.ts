import { Signal, WritableSignal, isSignal, signal } from "@angular/core";
import isEqual from "lodash-es/isEqual";

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
        typeof value === "object" && !Array.isArray(value) && !isSignal(value) // Check if the value is an instance of Terminant
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
          : isSignal(value) // Check if the value is an instance of Terminant
          ? value // unwrap the Terminant into an object
          : signal(value as SignalValue<T[P]>, { equal })
      ) as SignalStore<T>[P];
      return acc;
    },
    {} as SignalStore<T>
  );
}

// type NonFunctionKeys<T> = {
//   [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
// };

// type Leaves<T> = T extends object
//   ? {
//       [K in keyof NonFunctionKeys<T>]: `${Exclude<
//         NonFunctionKeys<T>[K],
//         symbol
//       >}${Leaves<T[NonFunctionKeys<T>[K]]> extends never
//         ? ''
//         : `.${Leaves<T[NonFunctionKeys<T>[K]]>}`}`;
//     }[keyof NonFunctionKeys<T>]
//   : never;

// type Paths<T> = T extends object
//   ? {
//       [K in keyof NonFunctionKeys<T>]: `${Exclude<
//         NonFunctionKeys<T>[K],
//         symbol
//       >}${'' | `.${Paths<T[NonFunctionKeys<T>[K]]>}`}`;
//     }[keyof NonFunctionKeys<T>]
//   : never;

// function getSignal<T>(
//   obj: SignalStore<T>,
//   path: Leaves<T> // | Paths<T> // pick one
// ): SignalValue<any> | undefined {
//   const keys = path.split('.');
//   let currentObject: any = obj;

//   for (const key of keys) {
//     if (currentObject && typeof currentObject[key] !== 'undefined') {
//       currentObject = currentObject[key];
//     } else {
//       return undefined;
//     }
//   }

//   // At this point, currentObject is the WritableSignal we're looking for
//   return currentObject();
// }

/***********************************************************************
 * WARNING:
 * This will recursively wrap each field into SignalStores and should
 * only be used for simple objects without any self-referenced fields
 * (for example, ArcGIS Layers and Objects).
 *
 * You can use the Terminant class to wrap a value marking it as the end
 * value/object to be stored as a writable signal.
 *
 * For objects that end in primitives or arrays of primitives, Terminant
 * is not needed. They are converted automatically.
 ***********************************************************************/
export function signalStore<T, P extends keyof T>(obj: T): SignalStore<T> {
  //  & {
  //   get: (path: Leaves<T>) => SimpleSignalValue | SimpleSignalValue[] | undefined;
  // }
  const store = create<T, P>(
    obj as
      | ArrayLike<SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]>>
      | { [s: string]: SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]> }
  );

  return store;
  // return {
  //   ...store,
  //   get: (path: Leaves<T>) => getSignal<T>(store, path)
  // };
}
