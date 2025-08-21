import { computed, Signal, WritableSignal, isSignal } from '@angular/core';
import type { SignalTree, DeepSignalify } from '@signaltree/core';

/**
 * Entity helpers interface - provides CRUD operations
 */
export interface EntityHelpers<E extends { id: string | number }> {
  add: (entity: E) => void;
  update: (id: string | number, updates: Partial<E>) => void;
  remove: (id: string | number) => void;
  upsert: (entity: E) => void;
  findById: (id: string | number) => Signal<E | undefined>;
  findBy: (predicate: (entity: E) => boolean) => Signal<E[]>;
  selectIds: () => Signal<Array<string | number>>;
  selectAll: () => Signal<E[]>;
  selectTotal: () => Signal<number>;
  findAll: () => Signal<E[]>;
  clear: () => void;
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
 * Creates entity helpers for a specific entity collection
 * This properly handles the SignalTree's DeepSignalify type structure
 *
 * CRITICAL: In SignalTree, arrays become WritableSignal<Array>
 * So `users: User[]` in the original state becomes `users: WritableSignal<User[]>` in tree.state
 */
function createEntityHelpers<T, E extends { id: string | number }>(
  tree: SignalTree<T>,
  entityKey: keyof T
): EntityHelpers<E> {
  // Get the signal from the deeply signalified state
  // The state property is of type DeepSignalify<T>
  const getEntitySignal = (): WritableSignal<E[]> => {
    // Access the state property - it's already a signal due to DeepSignalify
    // Use DeepSignalify<T> to represent the deeply-signalified shape and avoid `any`.
    const stateProperty = (tree.state as unknown as DeepSignalify<T>)[
      entityKey as keyof DeepSignalify<T>
    ];

    // Check if it exists
    if (!stateProperty) {
      throw new Error(
        `Entity key '${String(entityKey)}' does not exist in the state`
      );
    }

    // Due to DeepSignalify, if the original was an array, it's now WritableSignal<Array>
    if (!isSignal(stateProperty)) {
      throw new Error(
        `Entity key '${String(
          entityKey
        )}' is not a signal. This should not happen with SignalTree.`
      );
    }

    // Cast to WritableSignal and verify it contains an array
    const signal = stateProperty as WritableSignal<unknown>;
    const value = signal();

    if (!Array.isArray(value)) {
      throw new Error(
        `Entity key '${String(
          entityKey
        )}' does not contain an array. Current type: ${typeof value}`
      );
    }

    return signal as WritableSignal<E[]>;
  };

  return {
    add: (entity: E) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      // Check for duplicate
      if (currentEntities.some((e) => e.id === entity.id)) {
        throw new Error(`Entity with id '${entity.id}' already exists`);
      }

      entitySignal.set([...currentEntities, entity]);
    },

    update: (id: string | number, updates: Partial<E>) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const updatedEntities = currentEntities.map((entity) =>
        entity.id === id ? { ...entity, ...updates } : entity
      );

      entitySignal.set(updatedEntities);
    },

    remove: (id: string | number) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const filteredEntities = currentEntities.filter(
        (entity) => entity.id !== id
      );
      entitySignal.set(filteredEntities);
    },

    upsert: (entity: E) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const index = currentEntities.findIndex((e) => e.id === entity.id);
      if (index >= 0) {
        // Update existing
        const updatedEntities = [...currentEntities];
        updatedEntities[index] = entity;
        entitySignal.set(updatedEntities);
      } else {
        // Add new
        entitySignal.set([...currentEntities, entity]);
      }
    },

    findById: (id: string | number) => {
      const entitySignal = getEntitySignal();
      return computed(() => entitySignal().find((entity) => entity.id === id));
    },

    findBy: (predicate: (entity: E) => boolean) => {
      const entitySignal = getEntitySignal();
      return computed(() => entitySignal().filter(predicate));
    },

    selectIds: () => {
      const entitySignal = getEntitySignal();
      return computed(() => entitySignal().map((entity) => entity.id));
    },

    selectAll: () => {
      const entitySignal = getEntitySignal();
      return entitySignal as Signal<E[]>;
    },

    selectTotal: () => {
      const entitySignal = getEntitySignal();
      return computed(() => entitySignal().length);
    },

    findAll: () => {
      const entitySignal = getEntitySignal();
      return entitySignal as Signal<E[]>;
    },

    clear: () => {
      const entitySignal = getEntitySignal();
      entitySignal.set([]);
    },
  };
}

/**
 * Enhances a SignalTree with entity management capabilities
 * Works with SignalTree's DeepSignalify type structure
 *
 * The key insight: The state is already deeply signalified, so array properties
 * like `users: User[]` become `users: WritableSignal<User[]>` in tree.state
 */
export function withEntities(config: EntityConfig = {}) {
  const { enabled = true } = config;

  return function enhanceWithEntities<T>(tree: SignalTree<T>): SignalTree<T> & {
    asCrud<E extends { id: string | number }>(
      entityKey: keyof T
    ): EntityHelpers<E>;
  } {
    if (!enabled) {
      // When disabled, return the original tree object unchanged
      // Cast is safe here because we're not actually adding the method
      return tree as SignalTree<T> & {
        asCrud<E extends { id: string | number }>(
          entityKey: keyof T
        ): EntityHelpers<E>;
      };
    }

    // Type-safe enhancement that adds asCrud method using Object.assign
    // This approach preserves the generic method signature better than direct property assignment
    const enhancedTree = Object.assign(tree, {
      asCrud<E extends { id: string | number }>(
        entityKey: keyof T
      ): EntityHelpers<E> {
        return createEntityHelpers<T, E>(tree, entityKey);
      },
    });

    // Also expose asCrud on the callable proxy so callers can obtain
    // entity helpers from `tree.$.asCrud('users')`. Wrap in try/catch so
    // environments where the proxy is sealed won't throw.
    try {
      const stateProxy = tree.$ as unknown as {
        asCrud?: <E extends { id: string | number }>(
          key: keyof T
        ) => EntityHelpers<E> | undefined;
      };

      stateProxy.asCrud = function asCrudOnState<
        E extends { id: string | number }
      >(key: keyof T) {
        return createEntityHelpers<T, E>(tree, key);
      };
    } catch {
      // best-effort only
    }

    return enhancedTree;
  };
}

/**
 * Convenience function to enable entities with default config
 */
export function enableEntities() {
  return withEntities({ enabled: true });
}

/**
 * High-performance entity management configuration
 */
export function withHighPerformanceEntities() {
  return withEntities({
    enabled: true,
    trackChanges: true,
    validateIds: true,
  });
}
