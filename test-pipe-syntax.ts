import { signalTree } from '@signaltree/core';
import { withAsync } from '@signaltree/async';
import { withEntities } from '@signaltree/entities';
import { withBatching } from '@signaltree/batching';

// Test if pipe syntax works
interface TestState {
  users: Array<{ id: string; name: string }>;
  posts: Array<{ id: string; title: string }>;
  loading: boolean;
  [key: string]: unknown;
  [key: number]: unknown;
  [key: symbol]: unknown;
}

const initialState: TestState = {
  users: [],
  posts: [],
  loading: false,
};

try {
  // Test the pipe syntax
  const tree = signalTree(initialState)
    .pipe(withEntities())
    .pipe(withAsync())
    .pipe(withBatching());

  console.log('✅ Pipe syntax works!');
  console.log('Available methods:', Object.keys(tree));
  console.log('Has asCrud:', typeof tree.asCrud);
  console.log('Has asyncAction:', typeof tree.asyncAction);
  console.log('Has batchUpdate:', typeof tree.batchUpdate);

  // Test entity functionality
  const userManager = tree.asCrud<{ id: string; name: string }>('users');
  console.log('✅ Entity manager created');
  console.log('UserManager methods:', Object.keys(userManager));
} catch (error) {
  console.error('❌ Pipe syntax failed:', error);
}
