import { computed, Signal, WritableSignal } from '@angular/core';

import { isAnySignal, isNodeAccessor } from '../../../lib/utils';

import type { SignalTree, EntityHelpers } from '../../../lib/types';
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
 * This properly handles the SignalTree's TreeNode type structure
 *
 * CRITICAL: In SignalTree, arrays become WritableSignal<Array>
 * So `users: User[]` in the original state becomes `users: WritableSignal<User[]>` in tree.state
 */
function createEntityHelpers<T, E extends { id: string | number }>(
  tree: SignalTree<T>,
  entityKey: keyof T
): EntityHelpers<E> {
  // Get the signal from the deeply signalified state
  // The state property is of type TreeNode<T>
  const getEntitySignal = () => {
    // Access the state property - it's already a signal due to TreeNode
    // We need to use type assertion here because TypeScript can't track the deep signalification
    const stateProperty = (tree.state as any)[entityKey];

    // Check if it exists
    if (!stateProperty) {
      throw new Error(
        `Entity key '${String(entityKey)}' does not exist in the state`
      );
    }

    // Due to TreeNode, if the original was an array, it's now WritableSignal<Array>
    if (!isAnySignal(stateProperty)) {
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

  // Helper function to set values on both WritableSignal and callable signals
  const setSignalValue = (
    signal: WritableSignal<E[]> | ((value: E[]) => void),
    value: E[]
  ) => {
    if (isNodeAccessor(signal)) {
      // Callable signal - use function call
      (signal as (value: E[]) => void)(value);
    } else {
      // WritableSignal - use .set() method
      (signal as WritableSignal<E[]>).set(value);
    }
  };

  return {
    add: (entity: E) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      // Check for duplicate
      if (currentEntities.some((e) => e.id === entity.id)) {
        throw new Error(`Entity with id '${entity.id}' already exists`);
      }

      setSignalValue(entitySignal, [...currentEntities, entity]);
    },

    update: (id: string | number, updates: Partial<E>) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const updatedEntities = currentEntities.map((entity) =>
        entity.id === id ? { ...entity, ...updates } : entity
      );

      setSignalValue(entitySignal, updatedEntities);
    },

    remove: (id: string | number) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const filteredEntities = currentEntities.filter(
        (entity) => entity.id !== id
      );
      setSignalValue(entitySignal, filteredEntities);
    },

    upsert: (entity: E) => {
      const entitySignal = getEntitySignal();
      const currentEntities = entitySignal();

      const index = currentEntities.findIndex((e) => e.id === entity.id);
      if (index >= 0) {
        // Update existing
        const updatedEntities = [...currentEntities];
        updatedEntities[index] = entity;
        setSignalValue(entitySignal, updatedEntities);
      } else {
        // Add new
        setSignalValue(entitySignal, [...currentEntities, entity]);
      }
    },

    selectById: (id: string | number) => {
      const entitySignal = getEntitySignal();
      return computed(() => entitySignal().find((entity) => entity.id === id));
    },

    selectBy: (predicate: (entity: E) => boolean) => {
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

    clear: () => {
      const entitySignal = getEntitySignal();
      setSignalValue(entitySignal, []);
    },
  };
}

/**
 * Enhances a SignalTree with entity management capabilities
 * Works with SignalTree's TreeNode type structure
 *
 * The key insight: The state is already deeply signalified, so array properties
 * like `users: User[]` become `users: WritableSignal<User[]>` in tree.state
 */
export function withEntities(config: EntityConfig = {}) {
  const { enabled = true } = config;

  return function enhanceWithEntities<T>(tree: SignalTree<T>): SignalTree<T> & {
    entities<E extends { id: string | number }>(
      entityKey: keyof T
    ): EntityHelpers<E>;
  } {
    if (!enabled) {
      // When disabled, return the original tree object unchanged
      // Cast is safe here because we're not actually adding the method
      return tree as SignalTree<T> & {
        entities<E extends { id: string | number }>(
          entityKey: keyof T
        ): EntityHelpers<E>;
      };
    }

    // Type-safe enhancement that adds entities method using Object.assign
    // This approach preserves the generic method signature better than direct property assignment
    const enhancedTree = Object.assign(tree, {
      entities<E extends { id: string | number }>(
        entityKey: keyof T
      ): EntityHelpers<E> {
        return createEntityHelpers<T, E>(tree, entityKey);
      },
    });

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
