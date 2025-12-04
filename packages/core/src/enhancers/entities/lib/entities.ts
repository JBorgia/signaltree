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
 * Resolve a dot-notation path to a nested signal
 * Supports paths like 'app.data.users' by recursively navigating through the state tree
 *
 * @param tree - The SignalTree instance
 * @param path - Either a top-level key or dot-notation path like 'app.data.users'
 * @returns The signal at the specified path, or throws if path is invalid
 */
function resolveNestedSignal<T>(
  tree: SignalTree<T>,
  path: string | keyof T
): WritableSignal<unknown> {
  const pathStr = String(path);

  // Fast path: direct property access (top-level key)
  if (!pathStr.includes('.')) {
    const signal = (tree.state as any)[pathStr];
    if (!signal) {
      throw new Error(
        `Entity key '${pathStr}' does not exist in the state. Available top-level keys: ${Object.keys(
          tree.state as any
        ).join(', ')}`
      );
    }
    return signal;
  }

  // Nested path: split and navigate
  const segments = pathStr.split('.');
  let current: any = tree.state;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Dereference signal if needed
    if (isAnySignal(current)) {
      current = current();
    }

    // Navigate to next segment
    current = current[segment];

    if (current === undefined) {
      const attemptedPath = segments.slice(0, i + 1).join('.');
      throw new Error(
        `Entity path '${pathStr}' is invalid: '${attemptedPath}' does not exist in the state`
      );
    }
  }

  // Dereference final signal if needed
  if (isAnySignal(current)) {
    // We have a signal - validate it later
    return current as WritableSignal<unknown>;
  }

  throw new Error(
    `Entity path '${pathStr}' does not resolve to a signal. Ensure all parent levels in the path are valid nested objects.`
  );
}

/**
 * Creates entity helpers for a specific entity collection
 * This properly handles the SignalTree's TreeNode type structure
 *
 * CRITICAL: In SignalTree, arrays become WritableSignal<Array>
 * So `users: User[]` in the original state becomes `users: WritableSignal<User[]>` in tree.state
 *
 * Supports both top-level keys and nested paths:
 * - tree.entities<User>('users') - top-level
 * - tree.entities<User>('app.data.users') - nested
 */
function createEntityHelpers<T, E extends { id: string | number }>(
  tree: SignalTree<T>,
  entityKey: string | keyof T
): EntityHelpers<E> {
  // Get the signal from the deeply signalified state
  // The state property is of type TreeNode<T>
  const getEntitySignal = () => {
    // Use path resolution to handle both top-level and nested paths
    const signal = resolveNestedSignal(tree, entityKey);

    // Validate it's actually a signal
    if (!isAnySignal(signal)) {
      throw new Error(
        `Entity key '${String(
          entityKey
        )}' is not a signal. This should not happen with SignalTree.`
      );
    }

    // Cast to WritableSignal and verify it contains an array
    const castSignal = signal as WritableSignal<unknown>;
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
      entityKey: string | keyof T
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
