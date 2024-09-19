// Example Usage:

import { WritableSignal, signal } from '@angular/core';
import { signalStore } from './signal-store';

type Nested3 = {
  deeplyNested: boolean;
  deeplyNestedArray: number[];
  deeplyNestedUndefinedStringTyped: string;
  deeplyNestedStringOrUndefined?: string | undefined | unknown;
  deeplyNestedUndefined?: string | unknown;
};

type MyType = {
  prop1: number;
  prop2: {
    nested1: string;
    nested2: {
      deeplyNested: boolean;
      deeplyNestedArray: string[];
      nested3: Partial<Nested3>;
      nestedSignal4: WritableSignal<{
        deeplyNested: boolean;
        deeplyNestedArray: number[];
        deeplyNestedUndefinedStringTyped: string;
        deeplyNestedUndefined?: string | undefined | unknown;
      }>;
      nestedSignal5: WritableSignal<number[]>;
    };
  };
};

const storeConfigurationAndInititalizationObject: MyType = {
  prop1: 42,
  prop2: {
    nested1: 'hello',
    nested2: {
      deeplyNested: true,
      deeplyNestedArray: ['test'],
      nested3: {
        deeplyNested: true,
        deeplyNestedArray: [4, 5],
        deeplyNestedUndefinedStringTyped: undefined as unknown as string, // STRONG TYPE(string only): the initial state is undefined, but after it MUST be of type string
        deeplyNestedStringOrUndefined: null as unknown | string, // WEAKER TYPE(unknown | string): the initial state is undefined, and after it CAN be of type undefined or string
        deeplyNestedUndefined: undefined // STRONG TYPE(undefined only): example only, you would likely never do this. the initial state is undefined, but after it MUST be of type string
      },
      nestedSignal4: signal({
        // signal is here so the object will be left as a signal rather than wrapping each of its fields in signals.
        deeplyNested: true,
        deeplyNestedArray: [4, 5],
        deeplyNestedUndefinedStringTyped: undefined as unknown as string, // the initial state is undefined, but after it MUST be of type string
        deeplyNestedUndefined: undefined as unknown | string // the initial state is undefined, and after it CAN be of type undefined or string
      }),
      nestedSignal5: signal([4, 5]) // signal is here so the object will be left as a signal rather than wrapping each of its fields in signals.
    }
  }
};

const store = signalStore(storeConfigurationAndInititalizationObject);

// Accessing the properties with type inference using signals
const value1: number = store.prop1();
const value2: string = store.prop2.nested1();
const value3: boolean = store.prop2.nested2.deeplyNested();
const value4: string[] = store.prop2.nested2.deeplyNestedArray();
const value5: WritableSignal<number[] | undefined> | undefined =
  store.prop2.nested2.nested3.deeplyNestedArray;
const value6: {
  deeplyNested: boolean;
  deeplyNestedArray: number[];
  deeplyNestedUndefinedStringTyped: string;
  deeplyNestedUndefined?: string | unknown;
} = store.prop2.nested2.nestedSignal4();
const value7: number[] = store.prop2.nested2.nestedSignal5();

const unwrapedNested3: Partial<Nested3> = store.prop2.nested2.nested3.unwrap();

// Values can be modified in any way that WritableSignals can as they are just Signals
store.prop2.nested1.update((val) => val + ' world');
store.prop2;
