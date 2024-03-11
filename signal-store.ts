import { WritableSignal, signal } from "@angular/core";
import isEqual from "lodash-es/isEqual";

export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? isEqual(a, b) : a === b;
}

type SimpleSignalValue = string | number | boolean;
type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

/**********************************************************************************
 * Terminant is a wrapper class used to designate that the value is a terminal value
 * and should be a WritableSignal rather than recursively broken down into more
 * nested SignalStores.
 **********************************************************************************/
export class Terminant<T> {
  private _value?: T;
  constructor(value?: T) {
    this._value = value;
  }

  get primative() {
    return this._value as SignalValue<T[keyof T]>;
  }
}

export type SignalStore<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Terminant<infer TK>
      ? WritableSignal<TK>
      : SignalStore<T[K]>
    : WritableSignal<T[K]>;
} & {
  [K: string]: T[] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[] extends object
    ? T[] extends Terminant<infer TK>
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
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Terminant) // Check if the value is an instance of Terminant
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
          : value instanceof Terminant // Check if the value is an instance of Terminant
          ? signal(value.primative) // unwrap the Terminant into an object
          : signal(value as SignalValue<T[P]>, { equal })
      ) as SignalStore<T>[P];
      return acc;
    },
    {} as SignalStore<T>
  );
}

/***********************************************************************
 * WARNING:
 * This will recursively wrap each field into SignalStores and should
 * only be used for simple objects without any self-referenced fields
 * (for example, ArcGIS Layers and Objects).
 *
 * You can use the Terminant class to wrap a value marking it as the end
 * value/object to be stored as a writable signal.
 *
 * It works great for objects that end in primitives or arrays of primitives.
 ***********************************************************************/
export function signalStore<T, P extends keyof T>(obj: T): SignalStore<T> {
  const store = create<T, P>(
    obj as
      | ArrayLike<SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]>>
      | { [s: string]: SignalValue<T[P]> | SignalStore<T[P][keyof T[P]]> }
  );

  return store;
}

// Example Usage:
/**

const storeConfigurationAndInititalizationObject = {
    prop1: 42,
    prop2: {
        nested1: "hello",
        nested2: {
            deeplyNested: true,
            deeplyNestedArray: ["test"],
            nested3: {
                deeplyNested: true,
                deeplyNestedArray: [4, 5],
                deeplyNestedUndefinedStringTyped: undefined as unknown as string, // the initial state is undefined, but after it has to be of type string
                deeplyNestedUndefined: undefined as unknown | string, // the initial state is undefined, and after it can be of type undefined or string
            },
            nestedTerminant4: new Terminant({
                deeplyNested: true,
                deeplyNestedArray: [4, 5],
                deeplyNestedUndefinedStringTyped: undefined as unknown as string, // the initial state is undefined, but after it has to be of type string
                deeplyNestedUndefined: undefined as unknown | string, // the initial state is undefined, and after it can be of type undefined or string
            }),
            nestedTerminant5: new Terminant([4, 5]),
        },
    },
};

const store = signalStore(storeConfigurationAndInititalizationObject);

// Accessing the properties with type inference using signals
const value1: number = store.prop1();
const value2: string = store.prop2.nested1();
const value3: boolean = store.prop2.nested2.deeplyNested();
const value4: string[] = store.prop2.nested2.deeplyNestedArray();
const value5: WritableSignal<number[]> =
store.prop2.nested2.nested3.deeplyNestedArray;
const value6: {
    deeplyNested: boolean;
    deeplyNestedArray: number[];
    deeplyNestedUndefinedStringTyped: string;
    deeplyNestedUndefined: unknown;
} = store.prop2.nested2.nestedTerminant4();
const value7: number[] = store.prop2.nested2.nestedTerminant5();
console.log([value1, value2, value3, value4, value5, value6, value7]);
store.prop2.nested1.mutate((val) => val + " world");


*/
