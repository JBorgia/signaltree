// Integration test to verify how all packages work together
import { signalTree } from '@signaltree/core';
import { withAsync } from '@signaltree/async';
import { withEntities } from '@signaltree/entities';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withMiddleware } from '@signaltree/middleware';

// Test types and interfaces
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface AppState {
  users: User[];
  posts: any[];
  loading: boolean;
  count: number;
  [key: string]: unknown;
  [key: number]: unknown;
  [key: symbol]: unknown;
}

// Test full composition
const tree = signalTree<AppState>({
  users: [],
  posts: [],
  loading: false,
  count: 0,
}).pipe(
  withBatching(),
  withMemoization(),
  withMiddleware(),
  withAsync(),
  withEntities()
);

// Test entity operations
const userManager = tree.asCrud<User>('users');

// Test async operations
const asyncOp = tree.asyncAction(async (input: string) => {
  return { message: `Hello ${input}` };
});

console.log('Integration test setup complete');
console.log('Tree methods:', Object.keys(tree));
console.log('User manager methods:', Object.keys(userManager));
