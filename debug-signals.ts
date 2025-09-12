import { isSignal } from '@angular/core';
import { signalTree } from '@signaltree/core';

// Quick debug script to understand signal structure
// Let's see what we're working with
const testState = {
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark', notifications: true },
};

const tree = signalTree(testState);

console.log('tree.state:', tree.state);
console.log('tree.state.user:', tree.state.user);
console.log('tree.state.user type:', typeof tree.state.user);
console.log('tree.state.user.name:', tree.state.user.name);
console.log('tree.state.user.name type:', typeof tree.state.user.name);

// Test isSignal
console.log('isSignal(tree.state.user):', isSignal(tree.state.user));
console.log('isSignal(tree.state.user.name):', isSignal(tree.state.user.name));

// Check properties
console.log(
  'tree.state.user properties:',
  Object.getOwnPropertyNames(tree.state.user)
);
console.log(
  'tree.state.user.name properties:',
  Object.getOwnPropertyNames(tree.state.user.name)
);
