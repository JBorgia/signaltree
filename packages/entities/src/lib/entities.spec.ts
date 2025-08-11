import { signalTree } from '@signaltree/core';
import {
  withEntities,
  enableEntities,
  withHighPerformanceEntities,
} from './entities';

// Simple serializable interfaces that are compatible with StateObject
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface Post {
  id: string;
  title: string;
  content: string;
}

// Properly typed state interface that satisfies StateObject constraint
// This teaches proper TypeScript patterns for comprehensive index signatures
interface AppState {
  users: User[];
  posts: Post[];
  loading: boolean;
  // Complete index signatures required by StateObject = Record<string | number | symbol, unknown>
  [key: string]: unknown;
  [key: number]: unknown;
  [key: symbol]: unknown;
}

describe('Entities', () => {
  it('should enhance tree with entity capabilities', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancer = withEntities({ enabled: true });
    const enhancedTree = enhancer(tree);

    expect(enhancedTree.asCrud).toBeDefined();
    expect(typeof enhancedTree.asCrud).toBe('function');
  });

  it('should create entity helpers with CRUD operations', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    expect(userManager.add).toBeDefined();
    expect(userManager.update).toBeDefined();
    expect(userManager.remove).toBeDefined();
    expect(userManager.upsert).toBeDefined();
    expect(userManager.findById).toBeDefined();
    expect(userManager.findBy).toBeDefined();
    expect(userManager.selectIds).toBeDefined();
    expect(userManager.selectAll).toBeDefined();
    expect(userManager.selectTotal).toBeDefined();
  });

  it('should add entities to collection', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    const user: User = {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      active: true,
    };

    userManager.add(user);

    const allUsers = userManager.selectAll();
    expect(allUsers().length).toBe(1);
    expect(allUsers()[0]).toEqual(user);
  });

  it('should update existing entities', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    userManager.update('user-1', { name: 'John Smith', active: false });

    const allUsers = userManager.selectAll();
    const updatedUser = allUsers()[0];
    expect(updatedUser.name).toBe('John Smith');
    expect(updatedUser.active).toBe(false);
    expect(updatedUser.email).toBe('john@example.com'); // Should preserve other fields
  });

  it('should remove entities from collection', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
        {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          active: false,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    userManager.remove('user-1');

    const allUsers = userManager.selectAll();
    expect(allUsers().length).toBe(1);
    expect(allUsers()[0].id).toBe('user-2');
  });

  it('should upsert entities (add or update)', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    // Update existing
    userManager.upsert({
      id: 'user-1',
      name: 'John Smith',
      email: 'john@example.com',
      active: false,
    });

    // Add new
    userManager.upsert({
      id: 'user-2',
      name: 'Jane Doe',
      email: 'jane@example.com',
      active: true,
    });

    const allUsers = userManager.selectAll();
    expect(allUsers().length).toBe(2);
    expect(allUsers().find((u) => u.id === 'user-1')?.name).toBe('John Smith');
    expect(allUsers().find((u) => u.id === 'user-2')?.name).toBe('Jane Doe');
  });

  it('should find entity by id', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
        {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          active: false,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    const user1 = userManager.findById('user-1');
    const user3 = userManager.findById('user-3');

    expect(user1()?.name).toBe('John Doe');
    expect(user3()).toBeUndefined();
  });

  it('should find entities by predicate', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
        {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          active: false,
        },
        {
          id: 'user-3',
          name: 'Bob Smith',
          email: 'bob@example.com',
          active: true,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    const activeUsers = userManager.findBy((user) => user.active);
    const doeUsers = userManager.findBy((user) => user.name.includes('Doe'));

    expect(activeUsers().length).toBe(2);
    expect(activeUsers().every((u) => u.active)).toBe(true);
    expect(doeUsers().length).toBe(2);
    expect(doeUsers().every((u) => u.name.includes('Doe'))).toBe(true);
  });

  it('should select entity IDs', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
        {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          active: false,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    const userIds = userManager.selectIds();
    expect(userIds()).toEqual(['user-1', 'user-2']);
  });

  it('should select total count', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
        {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          active: false,
        },
        {
          id: 'user-3',
          name: 'Bob Smith',
          email: 'bob@example.com',
          active: true,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    const totalUsers = userManager.selectTotal();
    expect(totalUsers()).toBe(3);
  });

  it('should throw error when adding duplicate entity', () => {
    const tree = signalTree<AppState>({
      users: [
        {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          active: true,
        },
      ],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>()(tree);
    const userManager = enhancedTree.asCrud<User>('users');

    expect(() => {
      userManager.add({
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        active: false,
      });
    }).toThrow('Entity with id user-1 already exists');
  });

  it('should work with enableEntities convenience function', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancedTree = enableEntities<AppState>()(tree);
    expect(enhancedTree.asCrud).toBeDefined();
  });

  it('should work with high performance entities', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancedTree = withHighPerformanceEntities<AppState>()(tree);
    expect(enhancedTree.asCrud).toBeDefined();
  });

  it('should disable entities when enabled is false', () => {
    const tree = signalTree<AppState>({
      users: [],
      posts: [],
      loading: false,
    });

    const enhancedTree = withEntities<AppState>({ enabled: false })(tree);
    // When disabled, it should return the original tree without entity capabilities
    expect(enhancedTree).toBe(tree);
  });
});
