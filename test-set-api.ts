/**
 * Quick test to verify the new set() API works correctly
 */
import { signalTree } from './packages/core/src/lib/signal-tree';

// Test the new set() method
const tree = signalTree({
  user: {
    name: 'John',
    age: 30,
    settings: {
      theme: 'dark',
      notifications: true,
    },
  },
  count: 0,
});

console.log('=== TESTING NEW SET() API ===');

// Initial state
console.log('Initial state:');
console.log('tree.$():', tree.$());

// Test 1: Root level set()
console.log('\n1. Testing root level set()...');
tree.$.set({ count: 5 });
console.log('After tree.$.set({ count: 5 }):');
console.log('tree.$():', tree.$());

// Test 2: Nested level set()
console.log('\n2. Testing nested level set()...');
tree.$.user.set({ age: 31 });
console.log('After tree.$.user.set({ age: 31 }):');
console.log('tree.$():', tree.$());

// Test 3: Deep nested set()
console.log('\n3. Testing deep nested set()...');
tree.$.user.settings.set({ theme: 'light' });
console.log('After tree.$.user.settings.set({ theme: "light" }):');
console.log('tree.$():', tree.$());

// Test 4: Compare with update() method
console.log('\n4. Testing update() method for comparison...');
tree.$.update((current) => ({ count: current.count + 10 }));
console.log('After tree.$.update(current => ({ count: current.count + 10 })):');
console.log('tree.$():', tree.$());

console.log('\n✅ ALL SET() API TESTS COMPLETED!');
