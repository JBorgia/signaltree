import { WritableSignal, signal } from '@angular/core';
import { isEqual } from 'lodash-es';
import { signalStore } from './signal-tree-classic';

export type Configuration = Partial<{
    map: Partial<Map<string, string>>;
    date: DateConfiguration;
    children: Configuration;
}>;

export type ConfigurationRecord = Partial<
    Record<string | string, Configuration>
>;

export type DateConfiguration = Partial<{
    [K in string]: Date[keyof Date] | any; // Allows ArcGIS types plus extensions
}>;

export type DateConfigurations = Record<string, DateConfiguration>;

// Define your types
type Nested3 = {
    deeplyNested: boolean;
    deeplyNestedArray: number[];
    deeplyNestedUndefinedStringTyped: string;
    deeplyNestedStringOrUndefined: string | undefined | unknown;
    deeplyNestedUndefined: undefined;
};

type MyType = {
    prop1: number;
    prop2: {
        nested1: string;
        nested2: {
            deeplyNested: boolean;
            deeplyNestedConfiguration: WritableSignal<ConfigurationRecord>;
            deeplyNestedArray: string[];
            nested3: Nested3 & { deeplyNested3: Nested3 };
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

// Initial state configuration
const storeConfigurationAndInititalizationObject: MyType = {
    prop1: 42,
    prop2: {
        nested1: 'hello',
        nested2: {
            deeplyNested: true,
            deeplyNestedConfiguration: signal({} as ConfigurationRecord, {
                equal: isEqual,
            }),
            deeplyNestedArray: ['test'],
            nested3: {
                deeplyNested: true,
                deeplyNestedArray: [4, 5],
                deeplyNestedUndefinedStringTyped: undefined as unknown as string, // STRONG TYPE(string only): initial state is undefined, but it must be of type string afterward
                deeplyNestedStringOrUndefined: null as unknown | string, // WEAKER TYPE(unknown | string): initial state is undefined, but it can be undefined or string afterward
                deeplyNestedUndefined: undefined, // STRONG TYPE(undefined only): initial state is undefined, but it must be of type undefined afterward
                deeplyNested3: {
                    deeplyNested: true,
                    deeplyNestedArray: [7, 8],
                    deeplyNestedUndefinedStringTyped: null as unknown as string, // STRONG TYPE(string only): initial state is undefined, but it must be of type string afterward
                    deeplyNestedStringOrUndefined: undefined as unknown | string, // WEAKER TYPE(unknown | string): initial state is undefined, but it can be undefined or string afterward
                    deeplyNestedUndefined: undefined, // STRONG TYPE(undefined only): initial state is undefined, but it must be of type undefined afterward
                },
            },
            nestedSignal4: signal({
                deeplyNested: true,
                deeplyNestedArray: [4, 5],
                deeplyNestedUndefinedStringTyped: undefined as unknown as string, // STRONG TYPE(string only)
                deeplyNestedUndefined: undefined as unknown | string, // WEAKER TYPE(unknown | string)
            }),
            nestedSignal5: signal([4, 5]), // Initial state as a signal
        },
    },
};

// Create the store
const tree = signalStore(storeConfigurationAndInititalizationObject);

console.log('store', tree);
tree.prop2.nested2.nestedSignal4();

// Accessing values - using callable syntax
const value1: number = tree.prop1();
const value2: string = tree.prop2.nested1();
const value3: boolean = tree.prop2.nested2.deeplyNested();
const value4: string[] = tree.prop2.nested2.deeplyNestedArray();
const value5: WritableSignal<number[] | undefined> | undefined =
    tree.prop2.nested2.nested3.deeplyNestedArray;
const value6: {
    deeplyNested: boolean;
    deeplyNestedArray: number[];
    deeplyNestedUndefinedStringTyped: string;
    deeplyNestedUndefined?: string | unknown;
} = tree.prop2.nested2.nestedSignal4();
const value7: number[] = tree.prop2.nested2.nestedSignal5();
const value8: ConfigurationRecord =
    tree.prop2.nested2.deeplyNestedConfiguration();

// Example 1: Updating a string value
tree.prop2.nested1.update((val) => val + ' world'); // Updates 'hello' to 'hello world'

// Example 2: Updating a nested array value
tree.prop2.nested2.deeplyNestedArray.update((arr) => [...arr, 'newItem']); // Adds 'newItem' to the deeplyNestedArray

// Example 3: Updating a WritableSignal directly
tree.prop2.nested2.nestedSignal5.update((arr) => arr.map((x) => x * 2)); // Doubles each element in the array

// Example 4: Unwrapping part of the store - NOW USING CALLABLE SYNTAX
const unwrappedNested3: Partial<Nested3> =
    tree.prop2.nested2.nested3.deeplyNested3(); // Changed from .unwrap() to ()
console.log(unwrappedNested3.deeplyNestedArray); // Output: [7, 8]

// Example 5: Handling undefined values in updates
tree.prop2.nested2.nested3.deeplyNestedUndefinedStringTyped.update(
    () => 'New Value'
); // Updates with a new string value

// Example 6: Accessing nested signals - USING CALLABLE SYNTAX
console.log(
    'store.$.prop2.nested2.nested3',
    tree.prop2.nested2.nested3() // Changed from .unwrap() to ()
);
tree.prop2.nested2.nested3.update((curr) => ({
    deeplyNested: false,
    deeplyNestedArray: [1, 2, 3, 4],
    deeplyNestedUndefinedStringTyped: 'test1', // STRONG TYPE(string only): initial state is undefined, but it must be of type string afterward
    deeplyNestedStringOrUndefined: 'test2', // WEAKER TYPE(unknown | string): initial state is undefined, but it can be undefined or string afterward
}));
console.log(
    'store.$.prop2.nested2.nested3',
    tree.prop2.nested2.nested3() // Changed from .unwrap() to ()
);

// Example 7: Accessing nested signals
const nestedSignalValue = tree.prop2.nested2.nestedSignal4();
console.log(nestedSignalValue.deeplyNestedArray); // Output: [4, 5]

// Example 8: Using a terminal signal
const terminalSignal = signal({
    deeplyNested: false,
    deeplyNestedArray: [1, 2, 3],
});
const storeWithTerminal = signalStore({
    prop1: 0,
    prop2: {
        nested1: 'world',
        nested2: {
            deeplyNested: false,
            deeplyNestedArray: ['foo'],
            nested3: {},
            nestedSignal4: terminalSignal,
            nestedSignal5: signal([1, 2]),
        },
    },
});
console.log(storeWithTerminal.prop2.nested2.nestedSignal4().deeplyNestedArray); // Output: [1, 2, 3]

// NEW EXAMPLES showcasing the callable syntax benefits

// Example 9: Getting entire nested objects
const entireNested2 = tree.prop2.nested2(); // Gets the whole nested2 object unwrapped
console.log('Entire nested2:', entireNested2);

// Example 10: Getting intermediate tree nodes
const entireProp2 = tree.prop2(); // Gets the whole prop2 branch unwrapped
console.log('Entire prop2:', entireProp2);

// Example 11: Chaining calls for different levels
const deepValue = tree.prop2.nested2.nested3.deeplyNested3(); // Gets deeplyNested3 object
const shallowValue = tree.prop2.nested1(); // Gets string value
console.log('Deep value:', deepValue);
console.log('Shallow value:', shallowValue);

// Example 12: Consistency across different node types
// All these use the same () pattern:
const leafSignal = tree.prop1(); // Leaf signal value
const branchNode = tree.prop2.nested2(); // Branch node unwrapped
const arraySignal = tree.prop2.nested2.deeplyNestedArray(); // Array signal value
const terminalSignalValue = tree.prop2.nested2.nestedSignal4(); // Terminal signal value

console.log('Consistent access pattern across all node types');
console.log('Leaf:', leafSignal);
console.log('Branch:', branchNode);
console.log('Array:', arraySignal);
console.log('Terminal:', terminalSignalValue);