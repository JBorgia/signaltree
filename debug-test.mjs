import { test } from '@jest/globals';

test('debug callable structure', () => {
  const { signalTree } = require('../packages/core/src/lib/signal-tree');
  
  const tree = signalTree({ user: { name: 'John' } });
  
  console.log('=== Debug Info ===');
  console.log('tree.$.user type:', typeof tree.$.user);
  console.log('tree.$.user():', tree.$.user());
  console.log('tree.$.user.name type:', typeof tree.$.user.name);
  console.log('tree.$.user.name():', tree.$.user.name && tree.$.user.name());
  console.log('tree.$.user.name.set type:', typeof tree.$.user.name?.set);
  console.log('Has set property:', tree.$.user.name && 'set' in tree.$.user.name);
  console.log('Properties:', tree.$.user.name && Object.getOwnPropertyNames(tree.$.user.name));
  console.log('==================');
});
