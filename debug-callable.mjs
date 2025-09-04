// Simple debug script
import { signalTree } from './packages/core/src/lib/signal-tree.ts';

const tree = signalTree({ user: { name: 'John' } });
console.log('tree.$.user:', typeof tree.$.user);
console.log('tree.$.user():', tree.$.user());
console.log('tree.$.user.name:', typeof tree.$.user.name);
console.log('tree.$.user.name():', tree.$.user.name());
console.log('tree.$.user.name.set:', typeof tree.$.user.name?.set);
console.log('Has set property:', 'set' in tree.$.user.name);
console.log('Properties:', Object.getOwnPropertyNames(tree.$.user.name));

try {
  tree.$.user.name.set('Jane');
  console.log('Set worked! New value:', tree.$.user.name());
} catch (e) {
  console.log('Set failed:', e.message);
}
