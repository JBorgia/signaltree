/**
 * Test both update styles - functional and imperative
 */
import { signalTree } from './packages/core/src/lib/signal-tree';

// Test both update() styles
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

console.log('=== TESTING ENHANCED UPDATE() API ===');

// Initial state
console.log('Initial state:');
console.log('tree.$():', tree.$());

// Test 1: Functional style update (existing)
console.log('\n1. Testing functional style update()...');
tree.$.update((current) => ({ count: current.count + 1 }));
console.log('After tree.$.update(current => ({ count: current.count + 1 })):');
console.log('tree.$():', tree.$());

// Test 2: Imperative style update (new)
console.log('\n2. Testing imperative style update()...');
tree.$.update({ count: 10 });
console.log('After tree.$.update({ count: 10 }):');
console.log('tree.$():', tree.$());

// Test 3: Nested functional update
console.log('\n3. Testing nested functional update()...');
tree.$.user.update((current) => ({ age: current.age + 1 }));
console.log('After tree.$.user.update(current => ({ age: current.age + 1 })):');
console.log('tree.$():', tree.$());

// Test 4: Nested imperative update
console.log('\n4. Testing nested imperative update()...');
tree.$.user.update({ name: 'Jane' });
console.log('After tree.$.user.update({ name: "Jane" }):');
console.log('tree.$():', tree.$());

// Test 5: Compare with set() method
console.log('\n5. Testing set() method for comparison...');
tree.$.user.settings.set({ theme: 'light' });
console.log('After tree.$.user.settings.set({ theme: "light" }):');
console.log('tree.$():', tree.$());

console.log('\n✅ ALL ENHANCED UPDATE() API TESTS COMPLETED!');
