import { createEntitySignal } from '../entity-signal';
import { registerMarkerProcessor } from '../internals/materialize-markers';
import { isEntityMapMarker } from '../utils';

/**
 * EntityMap Marker Factory
 *
 * Self-registering marker for entity collections.
 * If you never use `entityMap()`, this code is tree-shaken from your bundle.
 */

import type { EntityConfig, EntityMapMarker } from '../types';

// =============================================================================
// SELF-REGISTERING MARKER FACTORY
// =============================================================================

/** @internal - Tracks if processor is registered */
let entityMapRegistered = false;

/**
 * Type for internal use with marker processor
 * @internal
 */
type InternalMarker = EntityMapMarker<
  Record<string, unknown>,
  string | number
> & {
  __entityMapConfig?: EntityConfig<Record<string, unknown>, string | number>;
};

/**
 * Create an entity map marker for use in signalTree state definition.
 *
 * Automatically registers its processor on first use - no manual
 * registration required. If you never use `entityMap()`, the processor
 * is tree-shaken out of your bundle.
 *
 * This is the ONLY way to create a type that satisfies EntityMapMarker,
 * since the brand symbol is not exported.
 *
 * @typeParam E - Entity type
 * @typeParam K - Key type (inferred from entity's `id` field if present)
 * @param config - Optional entity configuration
 * @returns EntityMapMarker to be processed during tree finalization
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 * });
 *
 * // Access entity methods after materialization
 * tree.$.users.set({ id: 1, name: 'Alice' });
 * tree.$.users.all(); // [{ id: 1, name: 'Alice' }]
 * ```
 */
export function entityMap<
  E,
  K extends string | number = E extends { id: infer I extends string | number }
    ? I
    : string
>(config?: EntityConfig<E, K>): EntityMapMarker<E, K> {
  // Self-register on first use (tree-shakeable)
  if (!entityMapRegistered) {
    entityMapRegistered = true;
    registerMarkerProcessor(
      isEntityMapMarker as (value: unknown) => value is InternalMarker,
      (marker, notifier, path) => {
        const cfg = marker.__entityMapConfig ?? {};
        return createEntitySignal(
          cfg as EntityConfig<Record<string, unknown>, string | number>,
          notifier,
          path
        );
      }
    );
  }

  // Runtime: only needs __isEntityMap for detection
  // Type-level: the brand symbol makes this nominally typed
  return {
    __isEntityMap: true,
    __entityMapConfig: config ?? {},
  } as EntityMapMarker<E, K>;
}
