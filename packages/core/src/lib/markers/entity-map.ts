import { computed, Signal } from '@angular/core';

import { createEntitySignal } from '../entity-signal';
import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';
import { isEntityMapMarker } from '../utils';
import { attachLoader, type EntityLoadOptions } from './entity-loader';

// Re-export isEntityMapMarker for convenience
export { isEntityMapMarker };

/**
 * EntityMap Marker Factory
 *
 * Self-registering marker for entity collections. If you never use `entityMap()`,
 * this code is tree-shaken from your bundle. Passing a `load` (plus optional
 * `staleTime`/`equal`/`swr`/`tags`/`persist`) turns the collection into a
 * cache-aware (single-scope), self-loading one; the loader machinery lives in `./entity-loader`
 * — a separate module for code organization, NOT a tree-shake boundary: it is
 * statically imported here, so it ships with `entityMap` whether or not `load`
 * is configured (~1.5 KB min+gzip of removable machinery; measured 2026-07-23,
 * RFC 0005 §6 — the injected-helper split that would reclaim it is archived as
 * the fallback design pending new evidence).
 */

import type {
  EntityConfig,
  EntityMapMarker,
  EntitySignal,
  LoadingEntityMapMarker,
} from '../types';

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
 * Builder for chainable computed slices on a plain entityMap.
 */
export interface EntityMapBuilder<
  E,
  K extends string | number,
  Slices extends Record<string, unknown> = Record<string, never>
> extends EntityMapMarker<E, K> {
  __computedSlices?: EntityMapComputedSlices<E>;
  __sliceTypes?: Slices;

  /**
   * Add a computed slice to this entityMap.
   *
   * @example
   * ```typescript
   * entityMap<Listing>()
   *   .computed('active', all => all.filter(l => l.status === 'active'))
   * // Access: tree.$.listings.active() // Signal<Listing[]>
   * ```
   */
  computed<N extends string, R>(
    name: N,
    compute: (entities: E[]) => R
  ): EntityMapBuilder<E, K, Slices & Record<N, R>>;

  /** Finalize and return the marker (usually unnecessary — the builder is a marker). */
  build(): EntityMapMarkerWithSlices<E, K, Slices>;
}

/**
 * Builder for a cache-aware (loading) entityMap — produced when `load` is
 * configured. Its materialized signal carries the loader surface.
 */
export interface LoadingEntityMapBuilder<
  E,
  K extends string | number,
  P = void,
  Slices extends Record<string, unknown> = Record<string, never>
> extends LoadingEntityMapMarker<E, K, P> {
  __computedSlices?: EntityMapComputedSlices<E>;
  __sliceTypes?: Slices;

  computed<N extends string, R>(
    name: N,
    compute: (entities: E[]) => R
  ): LoadingEntityMapBuilder<E, K, P, Slices & Record<N, R>>;

  build(): LoadingEntityMapMarker<E, K, P>;
}

// =============================================================================
// SELF-REGISTERING MARKER FACTORY
// =============================================================================

/** @internal - Tracks if processor is registered */
let entityMapRegistered = false;

/**
 * Internal marker shape as seen by the processor (runtime). Carries the optional
 * load options alongside the entity config.
 * @internal
 */
type InternalMarker = EntityMapMarker<
  Record<string, unknown>,
  string | number
> & {
  __entityMapConfig?: EntityConfig<Record<string, unknown>, string | number> &
    Partial<EntityLoadOptions<Record<string, unknown>, unknown>>;
  __computedSlices?: EntityMapComputedSlices<Record<string, unknown>>;
};

/**
 * Default key type: inferred from the entity's `id` field if present.
 * @internal
 */
type DefaultKey<E> = E extends { id: infer I extends string | number }
  ? I
  : string;

/**
 * Create an entity map marker for use in a `signalTree` state definition.
 *
 * Automatically registers its processor on first use — no manual registration.
 * If you never use `entityMap()`, the processor is tree-shaken out.
 *
 * Passing a `load` (plus optional `staleTime`/`equal`/`swr`/`tags`/`persist`/
 * `clearOnParamsChange`) makes the collection **cache-aware** — it loads itself,
 * exposes `.load()/.loadOrThrow()/.refresh()/.invalidate()/.loading()/.loaded()/.error()/
 * .lastLoadedAt()/.params()`, guards refetches by `staleTime`, coalesces
 * concurrent loads, and (with a loader that declares a param) is scoped per
 * `params` (one scope retained at a time — not a multi-key cache). Without
 * `load` it's a plain normalized client collection.
 *
 * @example Plain (client-side)
 * ```typescript
 * const tree = signalTree({ users: entityMap<User, number>() });
 * tree.$.users.addOne({ id: 1, name: 'Alice' });
 * ```
 *
 * @example Cache-aware (self-loading)
 * ```typescript
 * const tree = signalTree({
 *   plants: entityMap<Plant, string>({
 *     load: () => plantApi.list$(),
 *     selectId: (p) => p.url,
 *     staleTime: '30m',
 *     tags: ['plants'],
 *   }),
 * });
 * await tree.$.plants.load();   // guarded — no-op while fresh / in-flight
 * ```
 *
 * @example Scoped (parameterized)
 * ```typescript
 * const tree = signalTree({
 *   customers: entityMap<Customer, string, { regionUrl: string }>({
 *     load: ({ regionUrl }) => api.getCustomers$(regionUrl),
 *     selectId: (c) => c.externalId,
 *     staleTime: '30m',
 *   }),
 * });
 * await tree.$.customers.load({ regionUrl });  // per-scope freshness
 * ```
 *
 * @see RFC 0002, RFC 0003
 */
// Overload order matters: the LOADING overload is declared first so a config
// carrying `load` resolves to it; the PLAIN overload is declared LAST so that
// `ReturnType<typeof entityMap<E, K>>` (a common user idiom, and what the demos
// use) resolves to the plain builder rather than the loading one.
export function entityMap<
  E,
  K extends string | number = DefaultKey<E>,
  P = void
>(
  config: EntityConfig<E, K> & EntityLoadOptions<E, P>
): LoadingEntityMapBuilder<E, K, P, Record<string, never>>;
export function entityMap<E, K extends string | number = DefaultKey<E>>(
  config?: EntityConfig<E, K>
): EntityMapBuilder<E, K, Record<string, never>>;
export function entityMap<E, K extends string | number = DefaultKey<E>>(
  config?: EntityConfig<E, K> & Partial<EntityLoadOptions<E, unknown>>
): EntityMapBuilder<E, K, Record<string, never>> {
  // Self-register on first use (tree-shakeable)
  if (!entityMapRegistered) {
    entityMapRegistered = true;
    registerBuiltinMarkerProcessor(
      isEntityMapMarker as (value: unknown) => value is InternalMarker,
      (marker, notifier, path) => {
        const cfg = marker.__entityMapConfig ?? {};
        const entitySignal = createEntitySignal(
          cfg as EntityConfig<Record<string, unknown>, string | number>,
          notifier,
          path
        );

        // Computed slices
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

        // Cache-aware loading (only when `load` is configured)
        if (typeof cfg.load === 'function') {
          attachLoader(
            entitySignal as EntitySignal<
              Record<string, unknown>,
              string | number
            >,
            cfg as EntityLoadOptions<Record<string, unknown>, unknown>
          );
        }

        return entitySignal;
      }
    );
  }

  const slices: EntityMapComputedSlices<E> = {};

  const combined = {
    __isEntityMap: true as const,
    __entityMapConfig: config ?? {},
    __computedSlices: slices,

    computed<N extends string, R>(
      name: N,
      compute: (entities: E[]) => R
    ): EntityMapBuilder<E, K, Record<N, R>> {
      slices[name] = { compute: compute as (entities: E[]) => unknown };
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

  return combined as unknown as EntityMapBuilder<E, K, Record<string, never>>;
}
