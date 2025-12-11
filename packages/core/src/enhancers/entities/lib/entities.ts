import { EntitySignalImpl } from '../../../lib/entity-signal';
import { getPathNotifier } from '../../../lib/path-notifier';
import { isNodeAccessor } from '../../../lib/utils';

import type {
  EntityConfig,
  EntityMapMarker,
  EntitySignal,
  SignalTree,
} from '../../../lib/types';

interface EntitiesEnhancerConfig {
  enabled?: boolean;
    const value = castSignal();

    if (!Array.isArray(value)) {
      throw new Error(
        `Entity key '${String(
          entityKey
        )}' does not contain an array. Current type: ${typeof value}`
      );
    }

    return castSignal as WritableSignal<E[]>;
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
 *
 * Supports both top-level keys and nested paths for maximum flexibility
 */
export function withEntities(config: EntityConfig = {}) {
  const { enabled = true } = config;

  return function enhanceWithEntities<T>(tree: SignalTree<T>): SignalTree<T> & {
    entities<E extends { id: string | number }>(
      entityKey: keyof T | string
    ): EntityHelpers<E>;
  } {
    if (!enabled) {
      // When disabled, return the original tree object unchanged
      // Cast is safe here because we're not actually adding the method
      return tree as SignalTree<T> & {
        entities<E extends { id: string | number }>(
          entityKey: keyof T | string
        ): EntityHelpers<E>;
      };
    }

    // Type-safe enhancement that adds entities method using Object.assign
    // This approach preserves the generic method signature better than direct property assignment
    const enhancedTree = Object.assign(tree, {
      entities<E extends { id: string | number }>(
        entityKey: keyof T | string
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
