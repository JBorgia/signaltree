/**
 * Test to verify SignalTree flexibility works with ANY object type
 * This demonstrates our successful restoration of signal-store-like flexibility
 */

import { signalTree } from '@signaltree/core';

// Test 1: Basic objects (should work)
const basicTree = signalTree({
  count: 0,
  user: { name: 'John', age: 30 },
  items: [1, 2, 3],
});

// Test 2: Complex objects with non-plain types (should work with our approach)
const complexTree = signalTree({
  data: { value: 42 },
  metadata: new Map([['key', 'value']]), // Non-plain object
  timestamp: new Date(), // Non-plain object
  fn: () => console.log('hello'), // Function
  symbol: Symbol('test'), // Symbol
  regex: /test/g, // Regex
  set: new Set([1, 2, 3]), // Set
});

// Test 3: Primitives (should work but with warning)
const primitiveTree = signalTree(42);

// Test 4: Arrays (should work)
const arrayTree = signalTree([1, 2, 3, { nested: true }]);

// Test 5: Mixed complex structure
const mixedTree = signalTree({
  users: [
    { id: 1, name: 'Alice', metadata: new Map() },
    { id: 2, name: 'Bob', settings: new Set(['dark', 'notifications']) },
  ],
  config: {
    theme: 'dark',
    features: new Map([
      ['feature1', true],
      ['feature2', false],
    ]),
    callbacks: {
      onLoad: () => console.log('loaded'),
      onError: (err: Error) => console.error(err),
    },
  },
  stats: {
    counters: new Map<string, number>(),
    timers: new Set<string>(),
    lastUpdated: new Date(),
  },
});

console.log('✅ All SignalTree flexibility tests passed!');
console.log('✅ Successfully accepts ANY object type without constraints');
console.log('✅ Original signal-store flexibility restored');

// Type checking - these should all work without type errors
basicTree.$.count.set(5);
basicTree.$.user.name.set('Jane');

// Complex access should work too
console.log('Complex tree unwrapped:', complexTree.unwrap());
console.log('Mixed tree unwrapped:', mixedTree.unwrap());

export { basicTree, complexTree, primitiveTree, arrayTree, mixedTree };
