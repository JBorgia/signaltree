import { computed, Signal, WritableSignal } from '@angular/core';
import { SignalTree, StateObject } from '@signaltree/core';

/**
 * Entity helpers interface for CRUD operations on collections.
 *
 * Provides a comprehe/**
 * More flexible state type for entity management
 * Allows complex object arrays while still maintaining some structure
 */
export type EntityState = Record<string | number | symbol, unknown>;

/**
 * Enhanced SignalTree interface with entity capabilities
 */
interface EntitySignalTree<T extends EntityState> extends SignalTree<T> {
  asCrud<E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E>;
}

/**
 * Entity helpers interface for CRUD operations on collections.
 *
 * Provides a comprehensive set of methods for managing collections of entities
 * with reactive state management, optimized for Angular applications.
 *
 * @template E - Entity type (must have an id property)
 *
 * @example Basic Entity Management
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 *   active: boolean;
 * }
 *
 * // Add new entities
 * userManager.add({ id: '1', name: 'John', email: 'john@example.com', active: true });
 * userManager.add({ id: '2', name: 'Jane', email: 'jane@example.com', active: false });
 *
 * // Query entities
 * const allUsers = userManager.selectAll();
 * const activeUsers = userManager.findBy(user => user.active);
 * const userById = userManager.findById('1');
 * ```
 *
 * @example Advanced Entity Operations
 * ```typescript
 * // Update specific entity
 * userManager.update('1', { name: 'John Doe', active: false });
 *
 * // Upsert (add or update)
 * userManager.upsert({ id: '3', name: 'Bob', email: 'bob@example.com', active: true });
 *
 * // Find specific entities
 * const admins = userManager.findBy(user => user.role === 'admin');
 *
 * // Get entity IDs for optimized rendering
 * const userIds = userManager.selectIds();
 *
 * // Remove entities
 * userManager.remove('1');
 * ```
 */
export interface EntityHelpers<E extends { id: string | number }> {
  /**
   * Adds a new entity to the collection.
   *
   * @param entity - The entity to add (must include id)
   * @throws Error if entity with same id already exists
   *
   * @example
   * ```typescript
   * userManager.add({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   * ```
   */
  add: (entity: E) => void;

  /**
   * Updates an existing entity with partial data.
   *
   * @param id - The id of the entity to update
   * @param updates - Partial entity data to merge
   * @returns void (no-op if entity not found)
   *
   * @example
   * ```typescript
   * userManager.update('user-123', {
   *   name: 'John Smith',  // Update name
   *   lastLogin: new Date() // Add new field
   * });
   * ```
   */
  update: (id: string | number, updates: Partial<E>) => void;

  /**
   * Removes an entity from the collection.
   *
   * @param id - The id of the entity to remove
   * @returns void (no-op if entity not found)
   *
   * @example
   * ```typescript
   * userManager.remove('user-123');
   * ```
   */
  remove: (id: string | number) => void;

  /**
   * Adds entity if it doesn't exist, updates if it does.
   * Combines add and update operations for convenience.
   *
   * @param entity - Complete entity data
   *
   * @example
   * ```typescript
   * // Adds if new, updates if exists
   * userManager.upsert({
   *   id: 'user-123',
   *   name: 'Updated Name',
   *   email: 'new-email@example.com'
   * });
   * ```
   */
  upsert: (entity: E) => void;

  /**
   * Finds an entity by its id.
   *
   * @param id - The id to search for
   * @returns Signal that emits the entity or undefined if not found
   *
   * @example
   * ```typescript
   * const user = userManager.findById('user-123');
   * console.log(user()); // User | undefined
   *
   * // Reactive usage
   * effect(() => {
   *   const currentUser = user();
   *   if (currentUser) {
   *     console.log(`Current user: ${currentUser.name}`);
   *   }
   * });
   * ```
   */
  findById: (id: string | number) => Signal<E | undefined>;

  /**
   * Finds entities matching a predicate function.
   *
   * @param predicate - Function to test each entity
   * @returns Signal that emits array of matching entities
   *
   * @example
   * ```typescript
   * const activeUsers = userManager.findBy(user => user.active);
   * const admins = userManager.findBy(user => user.role === 'admin');
   * const recentUsers = userManager.findBy(user =>
   *   user.createdAt > Date.now() - 86400000 // Last 24 hours
   * );
   *
   * console.log(activeUsers()); // User[]
   * ```
   */
  findBy: (predicate: (entity: E) => boolean) => Signal<E[]>;

  /**
   * Returns all entity IDs in the collection.
   * Optimized for virtual scrolling and change tracking.
   *
   * @returns Signal that emits array of all entity IDs
   *
   * @example
   * ```typescript
   * const userIds = userManager.selectIds();
   * console.log(userIds()); // ['user-1', 'user-2', 'user-3']
   *
   * // Optimized rendering with trackBy
   * template: `
   *   <div *ngFor="let id of userIds(); trackBy: trackById">
   *     <user-card [userId]="id"></user-card>
   *   </div>
   * `
   * ```
   */
  selectIds: () => Signal<Array<string | number>>;

  /**
   * Returns all entities in the collection.
   *
   * @returns Signal that emits array of all entities
   *
   * @example
   * ```typescript
   * const allUsers = userManager.selectAll();
   * console.log(allUsers()); // User[]
   *
   * // Computed derived values
   * const userCount = computed(() => allUsers().length);
   * const activeUserCount = computed(() =>
   *   allUsers().filter(u => u.active).length
   * );
   * ```
   */
  selectAll: () => Signal<E[]>;

  /**
   * Returns the total number of entities in the collection.
   *
   * @returns Signal that emits the entity count
   *
   * @example
   * ```typescript
   * const userCount = userManager.selectTotal();
   * console.log(userCount()); // 42
   *
   * // Template usage
   * template: `<p>Total users: {{ userCount() }}</p>`
   * ```
   */
  selectTotal: () => Signal<number>;

  /**
   * Alias for selectAll() for backward compatibility.
   *
   * @returns Signal that emits array of all entities
   */
  findAll: () => Signal<E[]>;

  /**
   * Removes all entities from the collection.
   *
   * @example
   * ```typescript
   * userManager.clear();
   * console.log(userManager.selectAll()()); // []
   * ```
   */
  clear: () => void;
}

/**
 * Extended SignalTree interface with entity capabilities
 */
interface EntitySignalTree<T extends StateObject> extends SignalTree<T> {
  asCrud<E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E>;
}

/**
 * Entity configuration options
 */
interface EntityConfig {
  enabled?: boolean;
  trackChanges?: boolean;
  validateIds?: boolean;
}

/**
 * Creates entity helpers for managing collections of entities with CRUD operations
 */
function createEntityHelpers<
  T extends StateObject,
  E extends { id: string | number }
>(tree: SignalTree<T>, entityKey: keyof T): EntityHelpers<E> {
  // Get the signal for the entity collection
  const entitySignal = (tree.state as Record<string, WritableSignal<E[]>>)[
    entityKey as string
  ];

  if (!entitySignal || typeof entitySignal.update !== 'function') {
    throw new Error(
      `Invalid entity key: ${String(entityKey)} is not a valid signal`
    );
  }

  return {
    add: (entity: E) => {
      entitySignal.update((entities: E[]) => {
        const existingIndex = entities.findIndex((e) => e.id === entity.id);
        if (existingIndex >= 0) {
          throw new Error(`Entity with id ${entity.id} already exists`);
        }
        return [...entities, entity];
      });
    },

    update: (id: string | number, updates: Partial<E>) => {
      entitySignal.update((entities: E[]) =>
        entities.map((entity) =>
          entity.id === id ? { ...entity, ...updates } : entity
        )
      );
    },

    remove: (id: string | number) => {
      entitySignal.update((entities: E[]) =>
        entities.filter((entity) => entity.id !== id)
      );
    },

    upsert: (entity: E) => {
      entitySignal.update((entities: E[]) => {
        const index = entities.findIndex((e) => e.id === entity.id);
        if (index >= 0) {
          return entities.map((e, i) => (i === index ? entity : e));
        } else {
          return [...entities, entity];
        }
      });
    },

    findById: (id: string | number) =>
      computed(() => entitySignal().find((entity: E) => entity.id === id)),

    findBy: (predicate: (entity: E) => boolean) =>
      computed(() => entitySignal().filter(predicate)),

    selectIds: () =>
      computed(() => entitySignal().map((entity: E) => entity.id)),

    selectAll: () => entitySignal,

    selectTotal: () => computed(() => entitySignal().length),

    // Alias for backward compatibility
    findAll: () => entitySignal,

    clear: () => {
      entitySignal.update(() => []);
    },
  };
}

/**
 * Enhances a SignalTree with entity management capabilities
 */
export function withEntities<T extends StateObject>(
  config: EntityConfig = {}
): (tree: SignalTree<T>) => EntitySignalTree<T> {
  const { enabled = true } = config;

  return (tree: SignalTree<T>): EntitySignalTree<T> => {
    if (!enabled) {
      return tree as EntitySignalTree<T>;
    }

    const enhancedTree = tree as EntitySignalTree<T>;

    enhancedTree.asCrud = <E extends { id: string | number }>(
      entityKey: keyof T
    ): EntityHelpers<E> => {
      return createEntityHelpers<T, E>(tree, entityKey);
    };

    return enhancedTree;
  };
}

/**
 * Convenience function to enable entities with default settings
 */
export function enableEntities<T extends StateObject>() {
  return withEntities<T>({ enabled: true });
}

/**
 * Creates a specialized tree for entity management with common patterns
 */
export function createEntityTree<E extends { id: string | number }>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _initialEntities: E[] = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _config: EntityConfig = {}
) {
  // Import core signalTree - this will need to be available
  // For now, this is a placeholder that shows the pattern
  throw new Error(
    'createEntityTree requires core signalTree implementation - this is a modular version'
  );
}

/**
 * High-performance entity management with optimizations
 */
export function withHighPerformanceEntities<T extends StateObject>() {
  return withEntities<T>({
    enabled: true,
    trackChanges: true,
    validateIds: true,
  });
}
