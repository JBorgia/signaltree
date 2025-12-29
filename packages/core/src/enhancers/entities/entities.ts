/**
 * v6 Entities Enhancer
 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EntitiesEnabled
 *
 * This enhancer enables entity collections marked with entityMap() in the state.
 */

import type { SignalTreeBase, EntitiesEnabled, EntityMapMarker } from '../../lib/types';

export interface EntitiesConfig {
  /** ID field name (default: 'id') */
  idField?: string;
}

/**
 * Create an entity map marker for use in state definition.
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 * }
 *
 * const tree = signalTree({
 *   users: entityMap<User>(),
 * }).with(withEntities());
 *
 * // Now you can use entity methods
 * tree.$.users.upsert({ id: '1', name: 'Alice' });
 * tree.$.users.byId('1'); // { id: '1', name: 'Alice' }
 * ```
 */
export function entityMap<E, Key extends string | number = string>(): EntityMapMarker<E, Key> {
  // This is a compile-time marker only
  // The actual implementation is handled by the signal-tree factory
  return new Map() as unknown as EntityMapMarker<E, Key>;
}

/**
 * Enhances a SignalTree with entity collection support.
 *
 * @param config - Entities configuration
 * @returns Polymorphic enhancer function
 */
export function withEntities(
  config: EntitiesConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EntitiesEnabled {
  const { idField = 'id' } = config;

  return <S>(tree: SignalTreeBase<S>): SignalTreeBase<S> & EntitiesEnabled => {
    // The entity functionality is primarily compile-time via EntityMapMarker
    // Runtime entity signals are created by the signal-tree factory when it
    // encounters entityMap() markers.
    //
    // This enhancer simply marks the tree as entity-enabled.

    const enhanced = tree as SignalTreeBase<S> & EntitiesEnabled;
    enhanced.__entities = true;

    return enhanced;
  };
}

/**
 * Enable entities with default settings
 */
export function enableEntities(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & EntitiesEnabled {
  return withEntities();
}
