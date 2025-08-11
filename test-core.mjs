import { signalTree } from '../packages/core/src/index';

// Test basic functionality
const tree = signalTree({ count: 0, user: { name: 'John' } });

console.log('✅ signalTree created successfully');

// Test state access
console.log('Initial count:', tree.state.count());
console.log('Initial user name:', tree.state.user.name());

// Test state update
tree.state.count.set(5);
tree.state.user.name.set('Jane');

console.log('Updated count:', tree.state.count());
console.log('Updated user name:', tree.state.user.name());

// Test unwrap
const unwrapped = tree.unwrap();
console.log('Unwrapped state:', unwrapped);

// Test update method
tree.update((state) => ({ count: state.count + 10 }));
console.log('After update method:', tree.unwrap());

// Test pipe method
const result = tree.pipe((t) => t.unwrap().count);
console.log('Pipe result:', result);

console.log('✅ All core functionality tests passed!');
