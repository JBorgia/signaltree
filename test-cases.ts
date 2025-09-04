/* eslint-disable @nx/enforce-module-boundaries */
import { signal, WritableSignal } from '@angular/core';
import { isEqual } from 'lodash-es';

import { signalTree } from './packages/core/src/lib/signal-tree';
import { unwrap } from './packages/core/src/lib/utils';

export type Configuration = Partial<{
  map: Partial<Map<string, string>>;
  date: DateConfiguration;
  children: Configuration;
}>;

export type ConfigurationRecord = Partial<
  Record<string | string, Configuration>
>;

export type DateConfiguration = Partial<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
const tree = signalTree(storeConfigurationAndInititalizationObject);

//  console.log('store', tree); // Debug output
tree.$.prop2.nested2.nestedSignal4();

// Accessing values
const value1: number = tree.$.prop1();
const value2: string = tree.$.prop2.nested1();
const value3: boolean = tree.$.prop2.nested2.deeplyNested();
const value4: string[] = tree.$.prop2.nested2.deeplyNestedArray();
const value5: WritableSignal<number[] | undefined> | undefined =
  tree.$.prop2.nested2.nested3.deeplyNestedArray;
const value6: {
  deeplyNested: boolean;
  deeplyNestedArray: number[];
  deeplyNestedUndefinedStringTyped: string;
  deeplyNestedUndefined?: string | unknown;
} = tree.$.prop2.nested2.nestedSignal4();
const value7: number[] = tree.$.prop2.nested2.nestedSignal5();
const value8: ConfigurationRecord =
  tree.$.prop2.nested2.deeplyNestedConfiguration();

// Mark variables as used for demonstration purposes
void value1;
void value2;
void value3;
void value4;
void value5;
void value6;
void value7;
void value8;

// Example 1: Updating a string value
tree.$.prop2.nested1.update((val) => val + ' world'); // Updates 'hello' to 'hello world'

// Example 2: Updating a nested array value
tree.$.prop2.nested2.deeplyNestedArray.update((arr) => [...arr, 'newItem']); // Adds 'newItem' to the deeplyNestedArray

// Example 3: Updating a WritableSignal directly
tree.$.prop2.nested2.nestedSignal5.update((arr) => arr.map((x) => x * 2)); // Doubles each element in the array

// Example 4: Unwrapping part of the store
const unwrappedNested3: Nested3 = unwrap(
  tree.$.prop2.nested2.nested3.deeplyNested3
); // TypeScript inference limitation - works correctly at runtime
console.log(unwrappedNested3.deeplyNestedArray); // Output: [7, 8]

// Example 5: Handling undefined values in updates
tree.$.prop2.nested2.nested3.deeplyNestedUndefinedStringTyped.update(
  () => 'New Value'
); // Updates with a new string value

// Example 6: Accessing nested signals
const nested3BeforeUpdate: Nested3 = unwrap(tree.$.prop2.nested2.nested3);
console.log('store.$.prop2.nested2.nested3', nested3BeforeUpdate);

tree.$.prop2.nested2.nested3.update((curr) => {
  void curr; // Acknowledge current value
  return {
    deeplyNested: false,
    deeplyNestedArray: [1, 2, 3, 4],
    deeplyNestedUndefinedStringTyped: 'test1', // STRONG TYPE(string only): initial state is undefined, but it must be of type string afterward
    deeplyNestedStringOrUndefined: 'test2', // WEAKER TYPE(unknown | string): initial state is undefined, but it can be undefined or string afterward
  };
});
const nested3AfterUpdate: Nested3 = unwrap(tree.$.prop2.nested2.nested3);
console.log('store.$.prop2.nested2.nested3', nested3AfterUpdate);

// Example 7: Accessing nested signals
const nestedSignalValue: {
  deeplyNested: boolean;
  deeplyNestedArray: number[];
  deeplyNestedUndefinedStringTyped: string;
  deeplyNestedUndefined?: string | undefined | unknown;
} = tree.$.prop2.nested2.nestedSignal4();
console.log(nestedSignalValue.deeplyNestedArray); // Output: [4, 5]

// Example 8: Using a terminal signal
const terminalSignal: WritableSignal<{
  deeplyNested: boolean;
  deeplyNestedArray: number[];
}> = signal({
  deeplyNested: false,
  deeplyNestedArray: [1, 2, 3],
});
const storeWithTerminal = signalTree({
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
console.log(
  storeWithTerminal.$.prop2.nested2.nestedSignal4().deeplyNestedArray
); // Output: [1, 2, 3]

// ==============================================
// COMPREHENSIVE TEST CASES EXPANSION
// ==============================================

// Example 9: Testing set method on nested objects
tree.$.prop2.nested2.nested3.set({
  deeplyNested: false,
  deeplyNestedArray: [10, 20, 30],
  deeplyNestedUndefinedStringTyped: 'set method test',
  deeplyNestedStringOrUndefined: 'also set',
  deeplyNestedUndefined: undefined,
});
const setMethodResult: Nested3 = unwrap(tree.$.prop2.nested2.nested3);
console.log('After set method:', setMethodResult);

// Example 10: Testing partial updates with set
tree.$.prop2.nested2.nested3.set({
  deeplyNested: true, // Only updating this field
});
const partialSetResult: boolean = tree.$.prop2.nested2.nested3.deeplyNested();
console.log('After partial set:', partialSetResult);

// Example 11: Complex array operations
const arrayOps = signalTree({
  items: [1, 2, 3],
  nested: {
    matrix: [
      [1, 2],
      [3, 4],
    ],
    objects: [
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ],
  },
});

// Update arrays with various operations
arrayOps.$.items.update((arr) => [...arr, 4, 5]);
arrayOps.$.nested.matrix.update((matrix) => [...matrix, [5, 6]]);
arrayOps.$.nested.objects.update((objects) => [
  ...objects,
  { id: 3, name: 'third' },
]);

const arrayOpsResult: {
  items: number[];
  nested: {
    matrix: number[][];
    objects: { id: number; name: string }[];
  };
} = arrayOps.unwrap();
console.log('Array operations result:', arrayOpsResult);

// Example 12: Primitive types coverage
const primitiveTypes = signalTree({
  string: 'hello',
  number: 42,
  boolean: true,
  date: new Date('2024-01-01'),
  regex: /test/g,
  null: null,
  array: [1, 2, 3],
  nested: {
    symbol: Symbol('test'),
    bigint: BigInt(123),
    function: () => 'test', // Functions should be preserved
  },
});

// Test accessing all primitive types
const stringVal: string = primitiveTypes.$.string();
const numberVal: number = primitiveTypes.$.number();
const booleanVal: boolean = primitiveTypes.$.boolean();
const dateVal: Date = primitiveTypes.$.date();
const regexVal: RegExp = primitiveTypes.$.regex();
const nullVal: null = primitiveTypes.$.null();
const arrayVal: number[] = primitiveTypes.$.array();

console.log('Primitive types test:', {
  stringVal,
  numberVal,
  booleanVal,
  dateVal,
  regexVal,
  nullVal,
  arrayVal,
});

// Example 13: Edge cases with undefined and null
const edgeCases = signalTree({
  optional: undefined as string | undefined,
  nullable: null as string | null,
  mixed: null as string | null | undefined,
  nested: {
    optional: undefined as number | undefined,
    nullable: null as boolean | null,
  },
});

// Test updating undefined/null values
edgeCases.$.optional.set('now defined');
edgeCases.$.nullable.set('now not null');
edgeCases.$.nested.optional.set(123);
edgeCases.$.nested.nullable.set(true);

const edgeCasesResult: {
  optional: string | undefined;
  nullable: string | null;
  mixed: string | null | undefined;
  nested: {
    optional: number | undefined;
    nullable: boolean | null;
  };
} = edgeCases.unwrap();
console.log('Edge cases after updates:', edgeCasesResult);

// Example 14: Very deep nesting (6+ levels)
const deepNesting = signalTree({
  level1: {
    level2: {
      level3: {
        level4: {
          level5: {
            level6: {
              value: 'deep value',
              array: [1, 2, 3],
            },
          },
        },
      },
    },
  },
});

// Test deep access and updates
const deepValue: string =
  deepNesting.$.level1.level2.level3.level4.level5.level6.value();
deepNesting.$.level1.level2.level3.level4.level5.level6.value.set(
  'updated deep value'
);
deepNesting.$.level1.level2.level3.level4.level5.level6.array.update((arr) => [
  ...arr,
  4,
  5,
]);

const deepNestingResult: {
  level1: {
    level2: {
      level3: {
        level4: {
          level5: {
            level6: {
              value: string;
              array: number[];
            };
          };
        };
      };
    };
  };
} = deepNesting.unwrap();
console.log('Deep nesting test:', deepValue, deepNestingResult);

// Example 15: Multiple signal tree instances
const tree1 = signalTree({ count: 1, name: 'tree1' });
const tree2 = signalTree({ count: 2, name: 'tree2' });

// Test independence
tree1.$.count.set(10);
tree2.$.count.set(20);

// Verify independence with console logs
console.log('Tree1 count:', tree1.$.count()); // Should be 10
console.log('Tree2 count:', tree2.$.count()); // Should be 20
console.log('Tree1 name:', tree1.$.name()); // Should be 'tree1'
console.log('Tree2 name:', tree2.$.name()); // Should be 'tree2'

// Example 16: Circular reference prevention test
const circularTest: {
  name: string;
  child: {
    name: string;
    parent: { name: string } | null;
  };
} = {
  name: 'root',
  child: {
    name: 'child',
    parent: null as { name: string } | null, // Will not create circular reference
  },
};
// Note: Do not actually create circular references in the initial state
const circularTree = signalTree(circularTest);
const circularTestResult: {
  name: string;
  child: {
    name: string;
    parent: { name: string } | null;
  };
} = circularTree.unwrap();
console.log('Circular test (safe):', circularTestResult);

// Example 17: Large object stress test
const largeObject = signalTree({
  data: Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [
      `item${i}`,
      { value: i, enabled: i % 2 === 0 },
    ])
  ),
  metadata: {
    count: 100,
    lastUpdated: new Date(),
  },
});

// Test bulk updates
largeObject.$.metadata.count.set(200);
const largeObjectCount: number = largeObject.$.metadata.count();
console.log('Large object test count:', largeObjectCount);

// Example 18: Mixed content types
const mixedContent = signalTree({
  content: {
    text: 'Sample text',
    html: '<p>HTML content</p>',
    json: { data: 'json data' },
    binary: new Uint8Array([1, 2, 3, 4]),
    map: new Map([
      ['key1', 'value1'],
      ['key2', 'value2'],
    ]),
    setObject: new Set(['item1', 'item2', 'item3']),
  },
});

const mixedContentResult: {
  content: {
    text: string;
    html: string;
    json: { data: string };
    binary: Uint8Array;
    map: Map<string, string>;
    setObject: Set<string>;
  };
} = mixedContent.unwrap();
console.log('Mixed content test:', mixedContentResult);

// Example 19: Testing signal preservation from initial state
const signalPreservation = signalTree({
  normalValue: 'normal',
  existingSignal: signal('signal value'),
  nested: {
    normalNested: 'nested normal',
    existingNestedSignal: signal({ deep: 'signal object' }),
  },
});

// Test that existing signals are preserved
const signalPreservationTest: {
  normal: string;
  existing: string;
  nestedNormal: string;
  nestedSignal: { deep: string };
} = {
  normal: signalPreservation.$.normalValue(),
  existing: signalPreservation.$.existingSignal(),
  nestedNormal: signalPreservation.$.nested.normalNested(),
  nestedSignal: signalPreservation.$.nested.existingNestedSignal(),
};
console.log('Signal preservation test:', signalPreservationTest);

// Example 20: Error handling and edge cases
try {
  const errorTest = signalTree({
    safe: 'safe value',
    nested: {
      alsoSafe: 'also safe',
    },
  });

  // Test accessing non-existent properties (should be caught by TypeScript)
  console.log('Error test safe access:', errorTest.$.safe());

  // Test unwrapping with standalone unwrap function
  const unwrappedErrorTest: { safe: string; nested: { alsoSafe: string } } =
    unwrap(errorTest.$);
  console.log('Standalone unwrap test:', unwrappedErrorTest);
} catch (error) {
  console.error('Error in test cases:', error);
}

// Example 21: Performance considerations - batch updates simulation
const performanceTest = signalTree({
  counters: Array.from({ length: 10 }, (_, i) => ({ id: i, value: 0 })),
  status: 'idle' as 'idle' | 'running' | 'complete',
});

// Simulate multiple updates
performanceTest.$.status.set('running');
performanceTest.$.counters.update((counters) =>
  counters.map((counter) => ({ ...counter, value: counter.value + 1 }))
);
performanceTest.$.status.set('complete');

const performanceTestResult: {
  counters: { id: number; value: number }[];
  status: 'idle' | 'running' | 'complete';
} = performanceTest.unwrap();
console.log('Performance test result:', performanceTestResult);

// Example 22: Type assertion and strict typing validation
interface StrictInterface {
  id: number;
  name: string;
  metadata: {
    created: Date;
    tags: readonly string[];
  };
}

const strictTyping = signalTree<StrictInterface>({
  id: 1,
  name: 'Test',
  metadata: {
    created: new Date(),
    tags: ['tag1', 'tag2'] as const,
  },
});

// All operations should be type-safe
strictTyping.$.id.set(2);
strictTyping.$.name.set('Updated Test');
strictTyping.$.metadata.created.set(new Date('2024-01-01'));

const strictTypingResult: StrictInterface = strictTyping.unwrap();
console.log('Strict typing test:', strictTypingResult);

// ==============================================
// UTILITY FUNCTION TESTS
// ==============================================

// Example 23: Comprehensive unwrap testing
const unwrapTestData = signalTree({
  simple: 'string',
  number: 42,
  nested: {
    deep: {
      value: 'nested string',
      array: [1, 2, 3],
    },
  },
  array: ['a', 'b', 'c'],
  signal: signal('signal content'),
});

// Test unwrapping at different levels
const fullUnwrap: {
  simple: string;
  number: number;
  nested: {
    deep: {
      value: string;
      array: number[];
    };
  };
  array: string[];
  signal: string;
} = unwrap(unwrapTestData.$);
const nestedUnwrap: {
  deep: {
    value: string;
    array: number[];
  };
} = unwrap(unwrapTestData.$.nested);
const deepUnwrap: {
  value: string;
  array: number[];
} = unwrap(unwrapTestData.$.nested.deep);
const arrayUnwrap: string[] = unwrap(unwrapTestData.$.array);
const signalUnwrap: string = unwrap(unwrapTestData.$.signal);

console.log('Unwrap tests:', {
  full: fullUnwrap,
  nested: nestedUnwrap,
  deep: deepUnwrap,
  array: arrayUnwrap,
  signal: signalUnwrap,
});

// Verify unwrapped values have correct types and no signal methods
console.log('Type checks:', {
  simpleType: typeof fullUnwrap.simple, // Should be 'string'
  numberType: typeof fullUnwrap.number, // Should be 'number'
  isArray: Array.isArray(fullUnwrap.array), // Should be true
  nestedValue: fullUnwrap.nested.deep.value, // Should be 'nested string'
});

// Verify no set/update methods in unwrapped objects
console.log('Method presence checks:', {
  hasSetInRoot: 'set' in fullUnwrap, // Should be false
  hasUpdateInRoot: 'update' in fullUnwrap, // Should be false
  hasSetInNested: 'set' in fullUnwrap.nested, // Should be false
  hasUpdateInNested: 'update' in fullUnwrap.nested, // Should be false
});

// ==============================================
// END OF COMPREHENSIVE TEST CASES
// ==============================================
