// Test using the built packages directly
import { signalTree } from './dist/packages/core/index.js';
import { withAsync } from './dist/packages/async/index.js';
import { withEntities } from './dist/packages/entities/index.js';
import { withBatching } from './dist/packages/batching/index.js';

console.log('Testing pipe syntax with built packages...');

try {
  const initialState = {
    users: [],
    posts: [],
    loading: false,
  };

  // Test if each function exists
  console.log('signalTree type:', typeof signalTree);
  console.log('withAsync type:', typeof withAsync);
  console.log('withEntities type:', typeof withEntities);
  console.log('withBatching type:', typeof withBatching);

  // Create base tree
  const baseTree = signalTree(initialState);
  console.log('✅ Base tree created');
  console.log('Base tree has pipe:', typeof baseTree.pipe);

  // Test pipe syntax
  const enhancedTree = baseTree
    .pipe(withEntities())
    .pipe(withAsync())
    .pipe(withBatching());

  console.log('✅ Pipe syntax works!');
  console.log('Enhanced tree methods:', Object.keys(enhancedTree));

  // Test specific functionality
  console.log('Has asCrud:', typeof enhancedTree.asCrud);
  console.log('Has asyncAction:', typeof enhancedTree.asyncAction);
  console.log('Has batchUpdate:', typeof enhancedTree.batchUpdate);

  if (enhancedTree.asCrud) {
    const userManager = enhancedTree.asCrud('users');
    console.log('✅ Entity manager created via pipe syntax');
    console.log('UserManager methods:', Object.keys(userManager));
  }
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
}
