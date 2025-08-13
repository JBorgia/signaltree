import { signalTree } from '@signaltree/core';

// Test that we can now pass any object without constraints, like the original signal-store
const simpleData = {
  count: 0,
  user: {
    name: 'John',
    email: 'john@example.com',
  },
  items: [1, 2, 3],
};

// This should now work without any StateObject constraint errors
const tree = signalTree(simpleData);

// Test that types are correctly inferred
console.log('Count:', tree.$.count());
console.log('User name:', tree.$.user.name());
console.log('Items:', tree.$.items());

// Test updates
tree.$.count.set(42);
tree.$.user.name.set('Jane');
tree.$.items.set([4, 5, 6]);

console.log('Updated count:', tree.$.count());
console.log('Updated user name:', tree.$.user.name());
console.log('Updated items:', tree.$.items());

// Test unwrap
const unwrapped = tree.unwrap();
console.log('Unwrapped:', unwrapped);
