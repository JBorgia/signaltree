# signal-store
An Angular 16+ store built around Signals that focuses on simplicity



// Example Usage:

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
