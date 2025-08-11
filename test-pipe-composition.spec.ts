import { signalTree } from './packages/core/src/index';
import { withAsync } from './packages/async/src/index';
import { withEntities } from './packages/entities/src/index';
import { withBatching } from './packages/batching/src/index';

describe('Pipe Composition', () => {
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

  it('should support single pipe', () => {
    const tree = signalTree(initialState).pipe(withEntities());

    expect(tree.asCrud).toBeDefined();
    expect(typeof tree.asCrud).toBe('function');
  });

  it('should support multiple pipe composition', () => {
    const tree = signalTree(initialState)
      .pipe(withEntities())
      .pipe(withAsync())
      .pipe(withBatching());

    // Should have entity methods
    expect(tree.asCrud).toBeDefined();
    expect(typeof tree.asCrud).toBe('function');

    // Should have async methods
    expect(tree.asyncAction).toBeDefined();
    expect(typeof tree.asyncAction).toBe('function');

    // Should have batching methods
    expect(tree.batchUpdate).toBeDefined();
    expect(typeof tree.batchUpdate).toBe('function');
  });

  it('should support chained pipe syntax', () => {
    const tree = signalTree(initialState).pipe(
      withEntities(),
      withAsync(),
      withBatching()
    );

    // Should have all methods
    expect(tree.asCrud).toBeDefined();
    expect(tree.asyncAction).toBeDefined();
    expect(tree.batchUpdate).toBeDefined();
  });

  it('should work with actual operations', () => {
    const tree = signalTree(initialState)
      .pipe(withEntities())
      .pipe(withAsync());

    const userManager = tree.asCrud<{ id: string; name: string }>('users');

    // Add a user
    userManager.add({ id: '1', name: 'Test User' });

    // Verify it was added
    expect(tree.state.users().length).toBe(1);
    expect(tree.state.users()[0].name).toBe('Test User');

    // Create an async action
    const asyncAction = tree.asyncAction(async (input: string) => {
      return input.toUpperCase();
    });

    expect(asyncAction.pending()).toBe(false);
  });
});
