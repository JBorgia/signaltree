import { signalTree, withMiddleware } from '@signaltree/core';

// Test file to verify SignalTree middleware functionality
console.log('=== TESTING SIGNALTREE MIDDLEWARE ===');

// Create a test middleware that logs
const testMiddleware = {
  id: 'test-logger',
  before: (action, payload, state) => {
    console.log('🟡 BEFORE:', { action, payload, state });
    return true; // Allow the operation
  },
  after: (action, payload, previousState, newState) => {
    console.log('🟢 AFTER:', { action, payload, previousState, newState });
  },
};

// Create a tree with middleware
const tree = signalTree({
  counter: 0,
  message: 'initial',
}).with(withMiddleware([testMiddleware]));

console.log('Initial state:', tree());

// Test 1: Use tree callable (should trigger middleware)
console.log('\n--- Test 1: Using tree callable ---');
tree({ counter: 1, message: 'updated via callable' });

// Test 2: Use property updates (might NOT trigger middleware)
console.log('\n--- Test 2: Using property updates ---');
tree.state.counter.set(2);
tree.state.message.set('updated via property');

console.log('Final state:', tree());
console.log('=== END TEST ===');
