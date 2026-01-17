import { computed, Signal } from '@angular/core';

import { createEntitySignal } from '../entity-signal';
import { registerMarkerProcessor } from '../internals/materialize-markers';
import { isEntityMapMarker } from '../utils';

// Re-export isEntityMapMarker for convenience
export { isEntityMapMarker };

/**
 * EntityMap Marker Factory
 *
 * Self-registering marker for entity collections.
 * If you never use `entityMap()`, this code is tree-shaken from your bundle.
 */

import type { EntityConfig, EntityMapMarker, EntitySignal } from '../types';

// =============================================================================
// COMPUTED SLICE TYPES
// =============================================================================

/**
 * Configuration for a computed slice on entityMap
 */
export interface ComputedSliceConfig<E, R> {
  /** Compute function - receives all entities, returns derived value */
  compute: (entities: E[]) => R;
}

/**
 * Stored computed slice definitions for an entityMap marker
 * @internal
 */
export interface EntityMapComputedSlices<E> {
  [name: string]: ComputedSliceConfig<E, unknown>;
}

/**
 * EntityMap marker with computed slices attached
 * @internal
 */
export interface EntityMapMarkerWithSlices<
  E,
  K extends string | number,
  Slices extends Record<string, unknown>
> extends EntityMapMarker<E, K> {
  __computedSlices?: EntityMapComputedSlices<E>;
  /** Type-level only: the computed slice types */
  __sliceTypes?: Slices;
}

/**
 * EntitySignal extended with computed slices
 */
export type EntitySignalWithSlices<
  E,
  K extends string | number,
  Slices extends Record<string, unknown>
> = EntitySignal<E, K> & {
  [P in keyof Slices]: Signal<Slices[P]>;
};

/**
 * Builder for chainable computed slices on entityMap.
 * Extends EntityMapMarker so it's properly recognized by TreeNode type inference.
 */
export interface EntityMapBuilder<
  E,
  K extends string | number,
  Slices extends Record<string, unknown> = Record<string, never>
> extends EntityMapMarker<E, K> {
  /** Computed slices attached to this builder */
  __computedSlices?: EntityMapComputedSlices<E>;
  /** Type-level only: the computed slice types */
  __sliceTypes?: Slices;

  /**
   * Add a computed slice to this entityMap.
   * The slice is a Signal derived from all() entities.
   *
   * @param name - Name of the computed property
   * @param compute - Function that takes all entities and returns computed value
   * @returns Builder with the new slice type added
   *
   * @example
   * ```typescript
   * entityMap<Listing>()
   *   .computed('active', all => all.filter(l => l.status === 'active'))
   *   .computed('byStatus', all => groupBy(all, 'status'))
   *
   * // Access: tree.$.listings.active() // Signal<Listing[]>
   * // Access: tree.$.listings.byStatus() // Signal<Record<string, Listing[]>>
   * ```
   */
  computed<N extends string, R>(
    name: N,
    compute: (entities: E[]) => R
  ): EntityMapBuilder<E, K, Slices & Record<N, R>>;

  /**
   * Finalize and return the marker.
   * Usually not needed - the builder is assignable to EntityMapMarker.
   */
  build(): EntityMapMarkerWithSlices<E, K, Slices>;
}

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
  __computedSlices?: EntityMapComputedSlices<Record<string, unknown>>;
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
 * @returns EntityMapBuilder with chainable .computed() method
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 *   // With computed slices:
 *   listings: entityMap<Listing>()
 *     .computed('active', all => all.filter(l => l.status === 'active'))
 *     .computed('count', all => all.length),
 * });
 *
 * // Access entity methods after materialization
 * tree.$.users.addOne({ id: 1, name: 'Alice' });
 * tree.$.users.all(); // [{ id: 1, name: 'Alice' }]
 * tree.$.listings.active(); // Signal<Listing[]> - computed slice
 * ```
 */
export function entityMap<
  E,
  K extends string | number = E extends { id: infer I extends string | number }
    ? I
    : string
>(config?: EntityConfig<E, K>): EntityMapBuilder<E, K, Record<string, never>> {
  // Self-register on first use (tree-shakeable)
  if (!entityMapRegistered) {
    entityMapRegistered = true;
    registerMarkerProcessor(
      isEntityMapMarker as (value: unknown) => value is InternalMarker,
      (marker, notifier, path) => {
        const cfg = marker.__entityMapConfig ?? {};
        const entitySignal = createEntitySignal(
          cfg as EntityConfig<Record<string, unknown>, string | number>,
          notifier,
          path
        );

        // If there are computed slices, add them to the signal
        const slices = marker.__computedSlices;
        if (slices) {
          for (const [name, sliceConfig] of Object.entries(slices)) {
            const computedSignal = computed(() =>
              sliceConfig.compute(entitySignal.all())
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (entitySignal as any)[name] = computedSignal;
          }
        }

        return entitySignal;
      }
    );
  }

  // Create builder with chainable .computed()
  const slices: EntityMapComputedSlices<E> = {};

  // Create combined marker + builder object
  // The marker properties satisfy EntityMapMarker, and the methods satisfy EntityMapBuilder
  const combined = {
    // Marker properties (satisfies EntityMapMarker)
    __isEntityMap: true as const,
    __entityMapConfig: config ?? {},
    __computedSlices: slices,

    // Builder methods
    computed<N extends string, R>(
      name: N,
      compute: (entities: E[]) => R
    ): EntityMapBuilder<E, K, Record<N, R>> {
      slices[name] = { compute: compute as (entities: E[]) => unknown };
      // Return same object with updated type (type is tracked via TypeScript inference)
      return combined as unknown as EntityMapBuilder<E, K, Record<N, R>>;
    },

    build(): EntityMapMarkerWithSlices<E, K, Record<string, never>> {
      return combined as unknown as EntityMapMarkerWithSlices<
        E,
        K,
        Record<string, never>
      >;
    },
  };

  // Cast to builder type - the marker properties are included via the combined object
  return combined as unknown as EntityMapBuilder<E, K, Record<string, never>>;
}
