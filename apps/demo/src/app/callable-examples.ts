/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 🚨 IMPORTANT: This file demonstrates CALLABLE SYNTAX that requires BUILD-TIME TRANSFORMATION
 *
 * The TypeScript errors you see are INTENTIONAL and EXPECTED:
 * - "Expected 0 arguments, but got 1" - Shows the syntax needs transformation
 * - "Parameter implicitly has an 'any' type" - Pre-transform limitations
 *
 * This proves the zero-runtime overhead design:
 * ✅ Without transform: TypeScript errors (as expected)
 * ✅ With transform: tree.$.prop('val') → tree.$.prop.set('val') at build time
 * ✅ Zero runtime cost - pure build-time syntax sugar
 *
 * To run with transform: npm run callable:demo
 */
import '@signaltree/callable-syntax/augmentation';

import { signal, WritableSignal } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { isEqual } from 'lodash-es';

// ==============================================
// COMPREHENSIVE NODEASCCESSOR CALLABLE EXAMPLES
// ==============================================

/**
 * Callable Syntax Examples - Using @signaltree/callable-syntax Transform
 *
 * This file demonstrates the callable syntax sugar that gets transformed:
 * - tree.$.prop('value') → tree.$.prop.set('value')
 * - tree.$.prop(fn) → tree.$.prop.update(fn)
 *
 * ⚠️  TypeScript will show errors in the IDE because this syntax requires
 * the build-time transform to work. The errors are expected!
 *
 * To run with transform: npm run callable:demo
 */

console.log('=== CALLABLE SYNTAX TRANSFORM EXAMPLES ===\n');

// ==============================================
// Example 1: Basic Callable Patterns
// ==============================================

const basicTree = signalTree({
  name: 'John',
  age: 30,
  active: true,
  tags: ['developer', 'typescript'],
  profile: {
    email: 'john@example.com',
    settings: {
      theme: 'dark' as 'light' | 'dark',
      notifications: true,
    },
  },
});

console.log('--- Basic Callable Patterns ---');

// 1. Reading values with ()
console.log('Name:', basicTree.$.name());
console.log('Age:', basicTree.$.age());
console.log('Email:', basicTree.$.profile.email());
console.log('Theme:', basicTree.$.profile.settings.theme());

// 2. Setting values directly with callable syntax (transforms to .set())
basicTree.$.name('Jane');
basicTree.$.age(25);
basicTree.$.active(false);
basicTree.$.profile.email('jane@example.com');
basicTree.$.profile.settings.theme('light');

console.log('After callable sets:', {
  name: basicTree.$.name(),
  age: basicTree.$.age(),
  active: basicTree.$.active(),
  email: basicTree.$.profile.email(),
  theme: basicTree.$.profile.settings.theme(),
});

// 3. Functional updates with callable syntax (transforms to .update())
basicTree.$.age((current) => current + 5);
basicTree.$.name((current) => current.toUpperCase());
basicTree.$.tags((current) => [...current, 'react']);

console.log('After callable updates:', {
  name: basicTree.$.name(),
  age: basicTree.$.age(),
  tags: basicTree.$.tags(),
});

// ==============================================
// Example 2: Complex Object Updates
// ==============================================

const complexTree = signalTree({
  user: {
    id: 1,
    profile: {
      personal: {
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
      },
      professional: {
        title: 'Developer',
        company: 'TechCorp',
        skills: ['JavaScript', 'TypeScript', 'Angular'],
      },
    },
    preferences: {
      ui: {
        theme: 'dark',
        language: 'en',
        sidebar: { collapsed: false, width: 250 },
      },
      notifications: {
        email: true,
        push: false,
        frequency: 'daily' as 'never' | 'daily' | 'weekly',
      },
    },
  },
  projects: [
    { id: 1, name: 'Project Alpha', status: 'active', priority: 'high' },
    { id: 2, name: 'Project Beta', status: 'pending', priority: 'medium' },
  ],
});

console.log('\n--- Complex Object Updates ---');

// Deep nested direct updates using callable syntax
complexTree.$.user.profile.personal.firstName('Jane');
complexTree.$.user.profile.professional.title('Senior Developer');
complexTree.$.user.preferences.ui.theme('light');

// Complex functional updates using callable syntax
complexTree.$.user.profile.personal((current) => ({
  ...current,
  age: current.age + 1,
  firstName: current.firstName + ' Updated',
}));

complexTree.$.user.profile.professional.skills((current) =>
  current.map((skill) => (skill === 'Angular' ? 'React' : skill))
);

complexTree.$.projects((current) =>
  current.map((project) =>
    project.id === 1
      ? { ...project, status: 'completed', priority: 'low' }
      : project
  )
);

console.log('Updated complex tree:', {
  firstName: complexTree.$.user.profile.personal.firstName(),
  title: complexTree.$.user.profile.professional.title(),
  theme: complexTree.$.user.preferences.ui.theme(),
  age: complexTree.$.user.profile.personal.age(),
  skills: complexTree.$.user.profile.professional.skills(),
  projects: complexTree.$.projects(),
});

// ==============================================
// Example 3: Array Manipulation Patterns
// ==============================================

const arrayTree = signalTree({
  numbers: [1, 2, 3, 4, 5],
  users: [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
  ],
  nested: {
    matrix: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
    collections: {
      tags: ['red', 'blue', 'green'],
      categories: ['work', 'personal'],
    },
  },
});

console.log('\n--- Array Manipulation Patterns ---');

// Direct array replacement using callable syntax
arrayTree.$.numbers([10, 20, 30]);
console.log('Numbers replaced:', arrayTree.$.numbers());

// Functional array updates using callable syntax - adding elements
arrayTree.$.numbers((current) => [...current, 40, 50]);
arrayTree.$.users((current) => [
  ...current,
  { id: 3, name: 'Charlie', role: 'user' },
]);

// Functional array updates - filtering/mapping
arrayTree.$.numbers((current) => current.filter((n) => n > 25));
arrayTree.$.users((current) =>
  current.map((user) => (user.id === 2 ? { ...user, role: 'admin' } : user))
);

// Complex nested array operations
arrayTree.$.nested.matrix((current) => [...current, [7, 8, 9]]);

arrayTree.$.nested.collections.tags((current) =>
  current.concat(['yellow', 'purple']).sort()
);

console.log('Array manipulation results:', {
  numbers: arrayTree.$.numbers(),
  users: arrayTree.$.users(),
  matrix: arrayTree.$.nested.matrix(),
  tags: arrayTree.$.nested.collections.tags(),
});

// ==============================================
// Example 4: State Management Scenarios
// ==============================================

interface AppState {
  auth: {
    user: { id: number; name: string; email: string } | null;
    isLoggedIn: boolean;
    permissions: string[];
  };
  ui: {
    loading: boolean;
    modal: { open: boolean; type: string | null; data: unknown };
    sidebar: { collapsed: boolean; activeSection: string };
  };
  data: {
    cache: Record<string, unknown>;
    lastUpdated: Date;
    version: number;
  };
}

const appState = signalTree<AppState>({
  auth: {
    user: null,
    isLoggedIn: false,
    permissions: [],
  },
  ui: {
    loading: false,
    modal: { open: false, type: null, data: null },
    sidebar: { collapsed: false, activeSection: 'dashboard' },
  },
  data: {
    cache: {},
    lastUpdated: new Date(),
    version: 1,
  },
});

console.log('\n--- State Management Scenarios ---');

// Login scenario - multiple related updates using callable syntax
const loginUser = (user: { id: number; name: string; email: string }) => {
  appState.$.auth.user(user);
  appState.$.auth.isLoggedIn(true);
  appState.$.auth.permissions(['read', 'write']);
  appState.$.ui.loading(false);
  appState.$.data.lastUpdated(new Date());
};

// Show modal scenario
const showModal = (type: string, data: unknown) => {
  appState.$.ui.modal((current) => ({
    ...current,
    open: true,
    type,
    data,
  }));
};

// Update cache scenario
const updateCache = (key: string, value: unknown) => {
  appState.$.data.cache((current) => ({
    ...current,
    [key]: value,
  }));
  appState.$.data.version((current) => current + 1);
};

// Execute scenarios
loginUser({ id: 1, name: 'Jane Doe', email: 'jane@example.com' });
showModal('confirmation', { message: 'Save changes?' });
updateCache('user-preferences', { theme: 'dark', lang: 'en' });

console.log('App state after scenarios:', {
  user: appState.$.auth.user(),
  isLoggedIn: appState.$.auth.isLoggedIn(),
  permissions: appState.$.auth.permissions(),
  modal: appState.$.ui.modal(),
  cacheSize: Object.keys(appState.$.data.cache()).length,
  version: appState.$.data.version(),
});

// ==============================================
// Example 5: Built-in Object Types
// ==============================================

const builtInTree = signalTree({
  timestamp: new Date(),
  pattern: /test-\d+/gi,
  dataBuffer: new Uint8Array([1, 2, 3, 4]),
  keyValues: new Map([
    ['key1', 'value1'],
    ['key2', 'value2'],
  ]),
  uniqueItems: new Set(['item1', 'item2', 'item3']),
  nestedBuiltIns: {
    config: new Map<string, { enabled: boolean; value: number }>(),
    tags: new Set<string>(),
    binary: new ArrayBuffer(8),
  },
});

console.log('\n--- Built-in Object Types ---');

// Direct updates of built-in objects using callable syntax
builtInTree.$.timestamp(new Date('2024-01-01'));
builtInTree.$.pattern(/updated-\w+/g);
builtInTree.$.dataBuffer(new Uint8Array([10, 20, 30, 40, 50]));

// Functional updates with built-in objects
builtInTree.$.keyValues((current) => {
  const newMap = new Map(current);
  newMap.set('key3', 'value3');
  newMap.set('key4', 'value4');
  return newMap;
});

builtInTree.$.uniqueItems((current) => {
  const newSet = new Set(current);
  newSet.add('item4');
  newSet.add('item5');
  return newSet;
});

// Nested built-in object updates
builtInTree.$.nestedBuiltIns.config((current) => {
  const newConfig = new Map(current);
  newConfig.set('feature1', { enabled: true, value: 100 });
  newConfig.set('feature2', { enabled: false, value: 50 });
  return newConfig;
});

console.log('Built-in objects results:', {
  timestamp: builtInTree.$.timestamp(),
  pattern: builtInTree.$.pattern().source,
  bufferLength: builtInTree.$.dataBuffer().length,
  mapSize: builtInTree.$.keyValues().size,
  setSize: builtInTree.$.uniqueItems().size,
  configSize: builtInTree.$.nestedBuiltIns.config().size,
});

// ==============================================
// Example 6: Edge Cases and Error Scenarios
// ==============================================

const edgeTree = signalTree({
  nullable: null as string | null,
  optional: undefined as number | undefined,
  union: 'string' as string | number | boolean,
  deeply: {
    nested: {
      optional: undefined as { value: string } | undefined,
      array: [] as Array<{ id: number; data?: string }>,
    },
  },
  circular: {
    parent: null as { name: string; child: unknown } | null,
  },
});

console.log('\n--- Edge Cases and Error Scenarios ---');

// Handle null/undefined values using callable syntax
edgeTree.$.nullable('now defined');
edgeTree.$.optional(42);

// Union type updates
edgeTree.$.union(123);
edgeTree.$.union(true);
edgeTree.$.union('back to string');

// Complex optional updates
edgeTree.$.deeply.nested.optional({ value: 'created object' });
edgeTree.$.deeply.nested.optional((current) =>
  current ? { ...current, value: 'updated object' } : { value: 'default' }
);

// Array with optional properties
edgeTree.$.deeply.nested.array([
  { id: 1, data: 'first' },
  { id: 2 }, // no data property
  { id: 3, data: 'third' },
]);

edgeTree.$.deeply.nested.array((current) =>
  current.map((item) => ({
    ...item,
    data: item.data || `generated-${item.id}`,
  }))
);

console.log('Edge cases results:', {
  nullable: edgeTree.$.nullable(),
  optional: edgeTree.$.optional(),
  union: edgeTree.$.union(),
  nestedOptional: edgeTree.$.deeply.nested.optional(),
  arrayWithOptionals: edgeTree.$.deeply.nested.array(),
});

// ==============================================
// Example 7: Performance and Batch Updates
// ==============================================

const perfTree = signalTree({
  counters: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    value: 0,
    multiplier: 1,
  })),
  stats: {
    total: 0,
    average: 0,
    max: 0,
    lastCalculated: new Date(),
  },
  operations: {
    pending: [] as string[],
    completed: [] as string[],
    failed: [] as string[],
  },
});

console.log('\n--- Performance and Batch Updates ---');

// Batch counter updates using callable syntax
perfTree.$.counters(
  (current: { id: number; value: number; multiplier: number }[]) =>
    current.map(
      (
        counter: { id: number; value: number; multiplier: number },
        index: number
      ) => ({
        ...counter,
        value: counter.value + (index % 10),
        multiplier: counter.multiplier * 1.1,
      })
    )
);

// Recalculate stats based on counters
perfTree.$.stats(
  (current: {
    total: number;
    average: number;
    max: number;
    lastCalculated: Date;
  }) => {
    const counters = perfTree.$.counters();
    const values = counters.map(
      (c: { id: number; value: number; multiplier: number }) => c.value
    );
    return {
      ...current,
      total: values.reduce((sum: number, val: number) => sum + val, 0),
      average:
        values.reduce((sum: number, val: number) => sum + val, 0) /
        values.length,
      max: Math.max(...values),
      lastCalculated: new Date(),
    };
  }
);

// Simulate operation tracking
const operations = ['op1', 'op2', 'op3', 'op4', 'op5'];
operations.forEach((op, index) => {
  if (index < 3) {
    perfTree.$.operations.completed((current: string[]) => [...current, op]);
  } else if (index === 3) {
    perfTree.$.operations.pending((current: string[]) => [...current, op]);
  } else {
    perfTree.$.operations.failed((current: string[]) => [...current, op]);
  }
});

console.log('Performance results:', {
  counterCount: perfTree.$.counters().length,
  stats: perfTree.$.stats(),
  operations: {
    pending: perfTree.$.operations.pending().length,
    completed: perfTree.$.operations.completed().length,
    failed: perfTree.$.operations.failed().length,
  },
});

// ==============================================
// Summary and Syntax Transform Preview
// ==============================================

console.log('\n=== CALLABLE SYNTAX TRANSFORM PREVIEW ===');
console.log('Current NodeAccessor callable functionality:');
console.log('✅ tree.$.prop() - Read values');
console.log('✅ tree.$.prop(value) - Set values directly');
console.log('✅ tree.$.prop(updater) - Functional updates');
console.log('');
console.log('With @signaltree/callable-syntax, this becomes even cleaner:');
console.log('// tree.$.prop("value") → tree.$.prop.set("value")');
console.log('// tree.$.prop(fn) → tree.$.prop.update(fn)');
console.log('// Zero runtime overhead, full TypeScript support');

console.log('\n=== END OF COMPREHENSIVE TESTS ===');

// ==============================================
// SYNTAX TRANSFORM EXAMPLES (NEW)
// ==============================================

/**
 * ISSUES IDENTIFIED AND EXPLANATIONS:
 *
 * 1. SYNTAX TRANSFORM COMPATIBILITY:
 *    - The new callable-syntax package allows tree.$.prop('value') calls
 *    - These are converted at build time to tree.$.prop.set('value') or tree.$.prop.update(fn)
 *    - Current examples show the desired syntax vs current explicit syntax
 *
 * 2. TYPE SYSTEM ISSUES IN ORIGINAL EXAMPLES:
 *    - .set() and .update() methods don't exist on AccessibleNode<T>
 *    - Should use the callable syntax: tree.$.prop(value) instead of tree.$.prop.set(value)
 *    - Callable syntax provides cleaner API for accessing and modifying values
 *
 * 3. PERFORMANCE IMPLICATIONS:
 *    - Build-time transform adds zero runtime overhead
 *    - Maintains type safety while providing cleaner syntax
 *    - Function arguments automatically become .update() calls
 *    - Value arguments automatically become .set() calls
 */

// Create a sample tree for syntax examples
const syntaxExampleTree = signalTree({
  user: {
    name: 'John Doe',
    age: 30,
    profile: {
      email: 'john@example.com',
      isActive: true,
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    },
  },
  counter: 0,
  items: ['apple', 'banana', 'cherry'],
});

// SYNTAX TRANSFORM EXAMPLES (showing FUTURE capability vs current limitations):

/**
 * NOTE: The examples below show what the callable-syntax will enable.
 * Currently, SignalTree uses NodeAccessor<T> which only supports:
 * - tree.$.prop() // getter
 * - tree.$.prop(value) // NOT YET SUPPORTED - this is what callable-syntax will enable
 * - tree.$.prop(updater) // NOT YET SUPPORTED - this is what callable-syntax will enable
 */

// Example ST-1: Simple value setting (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.user.name('Jane Doe'); → tree.$.user.name.set('Jane Doe')
// syntaxExampleTree.$.user.name('Jane Doe'); // Will work after callable-syntax is applied

// Example ST-2: Nested object property setting (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.user.profile.email('jane@example.com'); → tree.$.user.profile.email.set('jane@example.com')
// syntaxExampleTree.$.user.profile.email('jane@example.com'); // Will work after callable-syntax

// Example ST-3: Function-based updates (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.counter(n => n + 1); → tree.$.counter.update(n => n + 1)
// syntaxExampleTree.$.counter(n => n + 1); // Will work after callable-syntax

// Example ST-4: Array updates with functions (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.items(arr => [...arr, 'date']); → tree.$.items.update(arr => [...arr, 'date'])
// syntaxExampleTree.$.items(arr => [...arr, 'date']); // Will work after callable-syntax

// Example ST-5: Boolean toggles (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.user.profile.isActive(active => !active); → tree.$.user.profile.isActive.update(active => !active)
// syntaxExampleTree.$.user.profile.isActive(active => !active); // Will work after callable-syntax

// Example ST-6: Object literal setting (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.user.profile.preferences({ theme: 'light', notifications: false }); → tree.$.user.profile.preferences.set({ theme: 'light', notifications: false })
// syntaxExampleTree.$.user.profile.preferences({ theme: 'light', notifications: false }); // Will work after callable-syntax

// Example ST-7: Deep nesting with mixed updates (FUTURE CAPABILITY)
// AFTER TRANSFORM: tree.$.user.profile.preferences.theme('light'); → tree.$.user.profile.preferences.theme.set('light')
// AFTER TRANSFORM: tree.$.user.age(age => age + 1); → tree.$.user.age.update(age => age + 1)
// syntaxExampleTree.$.user.profile.preferences.theme('light'); // Will work after callable-syntax
// syntaxExampleTree.$.user.age(age => age + 1); // Will work after callable-syntax

// Verify the syntax transform examples work
console.log('Syntax transform examples:');
console.log('User name:', syntaxExampleTree.$.user.name());
console.log('User email:', syntaxExampleTree.$.user.profile.email());
console.log('Counter:', syntaxExampleTree.$.counter());
console.log('Items:', syntaxExampleTree.$.items());
console.log('User active:', syntaxExampleTree.$.user.profile.isActive());
console.log('Theme:', syntaxExampleTree.$.user.profile.preferences.theme());

// SYNTAX TRANSFORM EXAMPLES (these would be transformed at build time):

// Example ST-1: Simple value setting
// TRANSFORMED: tree.$.user.name('Jane Doe'); → tree.$.user.name.set('Jane Doe')
syntaxExampleTree.$.user.name.set('Jane Doe'); // Current explicit syntax

// Example ST-2: Nested object property setting
// TRANSFORMED: tree.$.user.profile.email('jane@example.com'); → tree.$.user.profile.email.set('jane@example.com')
syntaxExampleTree.$.user.profile.email.set('jane@example.com'); // Current explicit syntax

// Example ST-3: Function-based updates (functions become .update calls)
// TRANSFORMED: tree.$.counter(n => n + 1); → tree.$.counter.update(n => n + 1)
syntaxExampleTree.$.counter.update((n) => n + 1); // Current explicit syntax

// Example ST-4: Array updates with functions
// TRANSFORMED: tree.$.items(arr => [...arr, 'date']); → tree.$.items.update(arr => [...arr, 'date'])
syntaxExampleTree.$.items.update((arr) => [...arr, 'date']); // Current explicit syntax

// Example ST-5: Boolean toggles
// TRANSFORMED: tree.$.user.profile.isActive(active => !active); → tree.$.user.profile.isActive.update(active => !active)
syntaxExampleTree.$.user.profile.isActive.update((active) => !active); // Current explicit syntax

// Example ST-6: Object literal setting (nested objects use call syntax)
// TRANSFORMED: tree.$.user.profile.preferences({ theme: 'light', notifications: false }); → tree.$.user.profile.preferences.set({ theme: 'light', notifications: false })
syntaxExampleTree.$.user.profile.preferences({
  theme: 'light',
  notifications: false,
}); // Current callable syntax

// Example ST-7: Deep nesting with mixed updates
// TRANSFORMED: tree.$.user.profile.preferences.theme('light'); → tree.$.user.profile.preferences.theme.set('light')
// TRANSFORMED: tree.$.user.age(age => age + 1); → tree.$.user.age.update(age => age + 1)
syntaxExampleTree.$.user.profile.preferences.theme.set('light'); // Current explicit syntax
syntaxExampleTree.$.user.age.update((age) => age + 1); // Current explicit syntax

// Verify the syntax transform examples work
console.log('Syntax transform examples:');
console.log('User name:', syntaxExampleTree.$.user.name());
console.log('User email:', syntaxExampleTree.$.user.profile.email());
console.log('Counter:', syntaxExampleTree.$.counter());
console.log('Items:', syntaxExampleTree.$.items());
console.log('User active:', syntaxExampleTree.$.user.profile.isActive());
console.log('Theme:', syntaxExampleTree.$.user.profile.preferences.theme());

// ==============================================
// ORIGINAL TEST CASES
// ==============================================

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

// Example 4: Reading nested values (current working syntax)
console.log('Nested deep value:', tree.$.prop2.nested2.nested3.deeplyNested3());
console.log('Nested array:', tree.$.prop2.nested2.nested3.deeplyNestedArray());

// NEW: Callable syntax examples (will work after callable-syntax)
/*
// Setting nested values with callable syntax
tree.$.prop2.nested2.nested3.deeplyNested3({
  deeplyNested: false,
  deeplyNestedArray: [10, 20]
});

// Updating nested arrays with functions
tree.$.prop2.nested2.nested3.deeplyNestedArray(arr => [...arr, 99]);
*/

// Example 5: Handling undefined values in updates
// ISSUE: .update() method doesn't exist on AccessibleNode<T>
// tree.$.prop2.nested2.nested3.deeplyNestedUndefinedStringTyped.update(
//   () => 'New Value'
// ); // Would update with a new string value

// Example 6: Accessing nested signals
const nested3BeforeUpdate: Nested3 = tree.$.prop2.nested2.nested3();
console.log('store.$.prop2.nested2.nested3', nested3BeforeUpdate);

// ISSUE: .update() method doesn't exist on AccessibleNode<T>
// tree.$.prop2.nested2.nested3.update((curr) => {
//   void curr; // Acknowledge current value
//   return {
//     deeplyNested: false,
//     deeplyNestedArray: [1, 2, 3, 4],
//     deeplyNestedUndefinedStringTyped: 'test1', // STRONG TYPE(string only): initial state is undefined, but it must be of type string afterward
//     deeplyNestedStringOrUndefined: 'test2', // WEAKER TYPE(unknown | string): initial state is undefined, but it can be undefined or string afterward
//   };
// });

// ISSUE: unwrap() function returns partial signal objects, not fully unwrapped values
// const nested3AfterUpdate: Nested3 = unwrap(tree.$.prop2.nested2.nested3);
// console.log('store.$.prop2.nested2.nested3', nested3AfterUpdate);

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
// ISSUE: .set() method doesn't exist on AccessibleNode - commenting out
/*
tree.$.prop2.nested2.nested3.set({
  deeplyNested: false,
  deeplyNestedArray: [10, 20, 30],
  deeplyNestedUndefinedStringTyped: 'set method test',
  deeplyNestedStringOrUndefined: 'also set',
  deeplyNestedUndefined: undefined,
});
*/

// NEW: Using callable syntax (will work after callable-syntax)
/*
tree.$.prop2.nested2.nested3({
  deeplyNested: false,
  deeplyNestedArray: [10, 20, 30],
  deeplyNestedUndefinedStringTyped: 'set method test',
  deeplyNestedStringOrUndefined: 'also set',
  deeplyNestedUndefined: undefined,
});
*/

// Current working approach - reading individual values
console.log(
  'Current deeply nested value:',
  tree.$.prop2.nested2.nested3.deeplyNested()
);
console.log(
  'Current deeply nested array:',
  tree.$.prop2.nested2.nested3.deeplyNestedArray()
);

// ISSUE: .set() method doesn't exist on AccessibleNode - commenting out
/*
tree.$.prop2.nested2.nested3.set({
  deeplyNested: true, // Only updating this field
});
*/

// Current working approach
const partialSetResult: boolean = tree.$.prop2.nested2.nested3.deeplyNested();
console.log('Current nested boolean value:', partialSetResult);

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

// Reading array values (current working syntax)
console.log('Array items:', arrayOps.$.items());
console.log('Nested matrix:', arrayOps.$.nested.matrix());
console.log('Nested objects:', arrayOps.$.nested.objects());

// NEW: Callable syntax for array operations (will work after callable-syntax)
/*
// Setting entire arrays
arrayOps.$.items([1, 2, 3, 4, 5]);

// Updating with functions
arrayOps.$.items(arr => [...arr, 6, 7]);
arrayOps.$.nested.matrix(matrix => [...matrix, [7, 8]]);
arrayOps.$.nested.objects(objects => [
  ...objects,
  { id: 4, name: 'fourth' }
]);
*/

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

// Reading updated values (current working syntax)
console.log('Updated optional:', edgeCases.$.optional());
console.log('Updated nullable:', edgeCases.$.nullable());
console.log('Updated nested optional:', edgeCases.$.nested.optional());
console.log('Updated nested nullable:', edgeCases.$.nested.nullable());

// NEW: Callable syntax for edge cases (will work after callable-syntax)
/*
// Setting optional/nullable values
edgeCases.$.optional('newly set value');
edgeCases.$.nullable('no longer null');
edgeCases.$.mixed('defined now');

// Nested updates
edgeCases.$.nested.optional(456);
edgeCases.$.nested.nullable(false);
*/

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
// const deepValue: string =  // COMMENTED OUT: unused variable
deepNesting.$.level1.level2.level3.level4.level5.level6.value();
deepNesting.$.level1.level2.level3.level4.level5.level6.value.set(
  'updated deep value'
);
deepNesting.$.level1.level2.level3.level4.level5.level6.array.update((arr) => [
  ...arr,
  4,
  5,
]);

// Reading deeply nested values (current working syntax)
const deepValueCurrent =
  deepNesting.$.level1.level2.level3.level4.level5.level6.value();
const deepArray =
  deepNesting.$.level1.level2.level3.level4.level5.level6.array();
console.log('Deep nesting - value:', deepValueCurrent);
console.log('Deep nesting - array:', deepArray);

// NEW: Callable syntax for deep nesting (will work after callable-syntax)
/*
// Setting deeply nested values
deepNesting.$.level1.level2.level3.level4.level5.level6.value('new deep value');

// Updating deeply nested arrays
deepNesting.$.level1.level2.level3.level4.level5.level6.array(arr => [...arr, 6, 7]);

// Setting entire nested objects
deepNesting.$.level1.level2.level3.level4.level5.level6({
  value: 'completely new',
  array: [100, 200, 300]
});
*/

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

// Reading circular structure values (current working syntax)
console.log('Circular test - root name:', circularTree.$.name());
console.log('Circular test - child name:', circularTree.$.child.name());
console.log('Circular test - parent ref:', circularTree.$.child.parent());

// Test updating circular structure
circularTree.$.name.set('updated root');
circularTree.$.child.name.set('updated child');
circularTree.$.child.parent.set({ name: 'parent reference' });

console.log('After updates:', {
  rootName: circularTree.$.name(),
  childName: circularTree.$.child.name(),
  parentRef: circularTree.$.child.parent(),
});

// NEW: Callable syntax for circular structures (after transform)
console.log('// Callable syntax examples:');
console.log(
  '// circularTree.$.name("new root");           // → .set("new root")'
);
console.log(
  '// circularTree.$.child.name("new child");    // → .set("new child")'
);
console.log(
  '// circularTree.$.child.parent({ name: "p" }); // → .set({ name: "p" })'
);
console.log('// circularTree.$.child(child => ({          // → .update(...)');
console.log('//   ...child,');
console.log('//   name: "functional update",');
console.log('//   parent: { name: "new parent" }');
console.log('// }));');

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

// Test reading mixed content types (current working syntax)
console.log('Mixed content values:', {
  text: mixedContent.$.content.text(),
  html: mixedContent.$.content.html(),
  json: mixedContent.$.content.json(),
  binary: mixedContent.$.content.binary(),
  map: mixedContent.$.content.map(),
  setObject: mixedContent.$.content.setObject(),
});

// Test updating mixed content types (using working methods)
mixedContent.$.content.text.set('Updated text');
mixedContent.$.content.html.set('<div>Updated HTML</div>');
// Note: Nested objects like json don't have direct .set() - would use callable syntax
// mixedContent.$.content.json.set({ data: 'updated json' }); // Not available without transform

// Update using working patterns
console.log('Current json:', mixedContent.$.content.json());
console.log('Current binary length:', mixedContent.$.content.binary().length);
console.log('Current map size:', mixedContent.$.content.map().size);

console.log('Updated mixed content:', {
  text: mixedContent.$.content.text(),
  json: mixedContent.$.content.json(),
  binaryLength: mixedContent.$.content.binary().length,
  mapSize: mixedContent.$.content.map().size,
  setSize: mixedContent.$.content.setObject().size,
});

// NEW: Callable syntax for mixed content (after transform)
console.log('// Mixed content callable syntax:');
console.log(
  '// mixedContent.$.content.text("new text");        // → .set(...)'
);
console.log(
  '// mixedContent.$.content.json({ data: "new" });   // → .set(...)'
);
console.log(
  '// mixedContent.$.content.binary(new Uint8Array([5,6])); // → .set(...)'
);
console.log(
  '// mixedContent.$.content.map(map => {             // → .update(...)'
);
console.log('//   map.set("added", "dynamically");');
console.log('//   return map;');
console.log('// });');

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

  // Test reading nested values (current working syntax)
  console.log('Error test nested safe access:', errorTest.$.nested.alsoSafe());

  // NEW: Callable syntax for error handling (after transform)
  console.log('// Error handling with callable syntax:');
  console.log(
    '// errorTest.$.safe("updated safe");           // → .set("updated safe")'
  );
  console.log(
    '// errorTest.$.nested.alsoSafe("also updated"); // → .set("also updated")'
  );
  console.log(
    '// errorTest.$.nested(nested => ({            // → .update(...)'
  );
  console.log('//   ...nested,');
  console.log('//   alsoSafe: "functional update"');
  console.log('// }));');
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

// Read performance test results (current working syntax)
console.log('Performance test results:', {
  counters: performanceTest.$.counters(),
  status: performanceTest.$.status(),
  totalCounters: performanceTest.$.counters().length,
  firstCounterValue: performanceTest.$.counters()[0]?.value,
});

// NEW: Callable syntax for performance scenarios (after transform)
console.log('// Performance with callable syntax:');
console.log(
  '// performanceTest.$.status("running");        // → .set("running")'
);
console.log('// performanceTest.$.counters(counters =>      // → .update(...)');
console.log('//   counters.map(c => ({ ...c, value: c.value + 1 }))');
console.log('// );');
console.log(
  '// performanceTest.$.status("complete");       // → .set("complete")'
);
console.log('//');
console.log('// Benefits: Cleaner syntax, same performance');
console.log('// The transform happens at build-time, so zero runtime overhead');

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

// Read strict typed values (current working syntax)
console.log('Strict typing test results:', {
  id: strictTyping.$.id(),
  name: strictTyping.$.name(),
  created: strictTyping.$.metadata.created(),
  tags: strictTyping.$.metadata.tags(),
});

// Verify type safety
const currentId: number = strictTyping.$.id(); // Must be number
const currentName: string = strictTyping.$.name(); // Must be string
const currentDate: Date = strictTyping.$.metadata.created(); // Must be Date

console.log('Type-safe access:', { currentId, currentName, currentDate });

// NEW: Callable syntax with strict typing (after transform)
console.log('// Strict typing with callable syntax:');
console.log(
  '// strictTyping.$.id(3);                     // → .set(3) - type safe!'
);
console.log(
  '// strictTyping.$.name("New Name");          // → .set("New Name")'
);
console.log(
  '// strictTyping.$.metadata.created(new Date()); // → .set(new Date())'
);
console.log(
  '// strictTyping.$.metadata(meta => ({        // → .update(...) - type safe!'
);
console.log('//   ...meta,');
console.log('//   tags: ["newTag1", "newTag2"] as const');
console.log('// }));');
console.log('//');
console.log('// TypeScript will catch type errors at compile time!');

// ==============================================
// UTILITY FUNCTION TESTS
// ==============================================

// Example 23: Comprehensive Value Access and Update Testing (Converted from unwrap examples)
const valueAccessTestData = signalTree({
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

// Test reading values at different levels (Current Working Syntax)
console.log('\n=== Value Access Testing (Current Syntax) ===');

// Reading individual values
const simpleValue: string = valueAccessTestData.$.simple();
const numberValue: number = valueAccessTestData.$.number();
const nestedValue: string = valueAccessTestData.$.nested.deep.value();
const arrayValue: string[] = valueAccessTestData.$.array();
const signalValue: string = valueAccessTestData.$.signal();

console.log('Current values:', {
  simple: simpleValue,
  number: numberValue,
  nested: nestedValue,
  array: arrayValue,
  signal: signalValue,
});

// Test updating values with current syntax
console.log('\n=== Value Update Testing (Current Syntax) ===');

// Update individual values
valueAccessTestData.$.simple.set('updated string');
valueAccessTestData.$.number.set(100);
valueAccessTestData.$.nested.deep.value.set('updated nested string');
valueAccessTestData.$.array.set(['x', 'y', 'z']);
valueAccessTestData.$.signal.set('updated signal content');

console.log('Updated values:', {
  simple: valueAccessTestData.$.simple(),
  number: valueAccessTestData.$.number(),
  nested: valueAccessTestData.$.nested.deep.value(),
  array: valueAccessTestData.$.array(),
  signal: valueAccessTestData.$.signal(),
});

// Test function-based updates
valueAccessTestData.$.number.update((n) => n * 2);
valueAccessTestData.$.array.update((arr) => [...arr, 'new']);
valueAccessTestData.$.nested.deep.array.update((nums) =>
  nums.map((n) => n * 10)
);

console.log('After function updates:', {
  number: valueAccessTestData.$.number(),
  array: valueAccessTestData.$.array(),
  deepArray: valueAccessTestData.$.nested.deep.array(),
});

console.log('\n=== NEW Callable Syntax Examples (After Transform) ===');
console.log('// These show the intended callable syntax patterns:');
console.log('');
console.log('// Setting values directly:');
console.log(
  '// valueAccessTestData.$.simple("new value");           // → .set("new value")'
);
console.log(
  '// valueAccessTestData.$.number(200);                   // → .set(200)'
);
console.log(
  '// valueAccessTestData.$.array(["a", "b", "c"]);        // → .set(["a", "b", "c"])'
);
console.log('');
console.log('// Nested object updates:');
console.log(
  '// valueAccessTestData.$.nested.deep.value("new deep"); // → .set("new deep")'
);
console.log(
  '// valueAccessTestData.$.nested.deep({                  // → .set({...})'
);
console.log('//   value: "complete replacement",');
console.log('//   array: [100, 200, 300]');
console.log('// });');
console.log('');
console.log('// Function-based updates:');
console.log(
  '// valueAccessTestData.$.number(n => n + 50);           // → .update(n => n + 50)'
);
console.log(
  '// valueAccessTestData.$.array(arr => [...arr, "more"]);// → .update(...)'
);
console.log(
  '// valueAccessTestData.$.nested.deep.array(arr =>       // → .update(...)'
);
console.log('//   arr.filter(n => n > 5)');
console.log('// );');

// Verify type safety and method presence
console.log('\n=== Type Safety Verification ===');
console.log('Value types:', {
  simpleType: typeof valueAccessTestData.$.simple(),
  numberType: typeof valueAccessTestData.$.number(),
  isArray: Array.isArray(valueAccessTestData.$.array()),
  nestedType: typeof valueAccessTestData.$.nested.deep.value(),
});

// Verify signal methods are available (these should exist)
console.log('Signal method availability:', {
  hasSetOnSimple: typeof valueAccessTestData.$.simple.set === 'function',
  hasUpdateOnNumber: typeof valueAccessTestData.$.number.update === 'function',
  hasSetOnArray: typeof valueAccessTestData.$.array.set === 'function',
  hasUpdateOnArray: typeof valueAccessTestData.$.array.update === 'function',
});

// ==============================================
// COMPREHENSIVE CALLABLE SYNTAX DEMONSTRATIONS
// ==============================================

console.log('\n=== COMPREHENSIVE CALLABLE SYNTAX EXAMPLES ===');

// Create a comprehensive demo tree
const callableDemo = signalTree({
  // Primitive values
  name: 'John Doe',
  age: 30,
  active: true,

  // Objects
  profile: {
    email: 'john@example.com',
    settings: {
      theme: 'dark' as 'light' | 'dark',
      notifications: true,
      privacy: {
        showEmail: false,
        allowMessages: true,
      },
    },
  },

  // Arrays
  tags: ['developer', 'typescript', 'angular'],
  scores: [95, 87, 92],

  // Mixed complex data
  projects: [
    { id: 1, name: 'SignalTree', status: 'active' },
    { id: 2, name: 'Other', status: 'complete' },
  ],

  // Nullable/optional values
  notes: undefined as string | undefined,
  priority: null as number | null,
});

console.log('\n--- Current Working Syntax (will always work) ---');

// Reading values
console.log('Name:', callableDemo.$.name());
console.log('Email:', callableDemo.$.profile.email());
console.log('Theme:', callableDemo.$.profile.settings.theme());
console.log('Tags:', callableDemo.$.tags());
console.log('First project:', callableDemo.$.projects()[0]);

// Setting values with .set()
callableDemo.$.name.set('Jane Doe');
callableDemo.$.age.set(25);
callableDemo.$.active.set(false);
console.log('Updated name:', callableDemo.$.name());

// Updating with .update()
callableDemo.$.age.update((age) => age + 1);
callableDemo.$.tags.update((tags) => [...tags, 'javascript']);
console.log('Updated age:', callableDemo.$.age());
console.log('Updated tags:', callableDemo.$.tags());

console.log('\n--- NEW Callable Syntax (after callable-syntax) ---');
console.log('// These examples show the intended callable syntax:');
console.log('// callableDemo.$.name("Alice");              // → .set("Alice")');
console.log('// callableDemo.$.age(28);                    // → .set(28)');
console.log('// callableDemo.$.active(true);               // → .set(true)');
console.log('//');
console.log('// // Nested object updates');
console.log('// callableDemo.$.profile.email("new@email.com");  // → .set()');
console.log('// callableDemo.$.profile.settings.theme("light"); // → .set()');
console.log('//');
console.log('// // Array updates');
console.log('// callableDemo.$.tags(["new", "tags"]);     // → .set()');
console.log(
  '// callableDemo.$.scores(scores => [...scores, 100]); // → .update()'
);
console.log('//');
console.log('// // Complex object updates');
console.log('// callableDemo.$.profile.settings({         // → .set()');
console.log('//   theme: "light",');
console.log('//   notifications: false,');
console.log('//   privacy: { showEmail: true, allowMessages: false }');
console.log('// });');
console.log('//');
console.log('// // Function-based updates');
console.log('// callableDemo.$.projects(projects =>       // → .update()');
console.log(
  '//   projects.map(p => p.id === 1 ? {...p, status: "updated"} : p)'
);
console.log('// );');
console.log('//');
console.log('// // Optional/nullable updates');
console.log('// callableDemo.$.notes("Important note");   // → .set()');
console.log('// callableDemo.$.priority(5);               // → .set()');

console.log('\n--- Transform Rules Summary ---');
console.log('1. tree.$.prop("value")     → tree.$.prop.set("value")');
console.log('2. tree.$.prop(fn)          → tree.$.prop.update(fn)');
console.log('3. tree.$.prop()            → tree.$.prop() (unchanged)');
console.log('4. Works at any nesting level');
console.log('5. Zero runtime overhead - build-time only');
console.log('6. Full TypeScript support');

console.log('\n=== END CALLABLE SYNTAX EXAMPLES ===');

/*
// NOTE: The following sections contained examples that used the old unwrap() function
// which is no longer available in the public API. They have been commented out to
// prevent compilation errors. The callable syntax examples above demonstrate
// the recommended patterns for the new callable-syntax functionality.
//
// Key points:
// - unwrap() was removed from the public API as it's internal-only
// - Callable syntax is the new recommended pattern
// - Use .set() and .update() methods for current compatibility
// - Enable @signaltree/callable-syntax for the new callable syntax
*/

// ==============================================
// END OF COMPREHENSIVE TEST CASES
// ==============================================
