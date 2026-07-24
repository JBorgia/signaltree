import { computed, Signal } from '@angular/core';

import { createEntitySignal } from '../entity-signal';
import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';
import { isEntityMapMarker, isLoaderFeature } from '../utils';

// Re-export isEntityMapMarker for convenience
export { isEntityMapMarker };

/**
 * EntityMap Marker Factory
 *
 * Self-registering marker for entity collections. If you never use `entityMap()`,
 * this code is tree-shaken from your bundle. Passing a `load` turns the
 * collection into a cache-aware (single-scope), self-loading one; the loader
 * machinery lives in `./entity-loader`.
 *
 * Tree-shake boundary (RFC 0005 §6): the loader machinery is reached ONLY
 * through the `loader()` helper (`./loader`) — `entityMap({ load: loader(fn,
 * opts) })`. This file does NOT import `attachLoader`; the `loader()` feature
 * carries the only reference to it, so a plain `entityMap()` (or one whose
 * `load` is never a loader feature) tree-shakes the loader/cache/SWR/persist
 * code out entirely. A raw function passed to `load` fails closed ([ST2004]) —
 * it cannot silently no-op. (v12 removed the deprecated raw `load: fn` path;
 * this is the reclaim RFC 0005 was staged to earn.)
 */

import type {
  EntityConfig,
  EntityMapMarker,
  EntitySignal,
  LoaderFeature,
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
  __entityMapConfig?: EntityConfig<Record<string, unknown>, string | number> & {
    // `load` is a `loader()` feature (v12). Typed `unknown` here — the
    // processor guards with `isLoaderFeature` and fails closed on anything
    // else (e.g. a JS/`any` caller passing a raw function).
    load?: unknown;
  };
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
 * Passing a `load` — as a `loader()` feature (preferred) or a raw function
 * (deprecated, [ST2004]) — makes the collection **cache-aware**: it loads
 * itself, exposes `.load()/.loadOrThrow()/.refresh()/.invalidate()/.loading()/
 * .loaded()/.error()/.lastLoadedAt()/.params()`, guards refetches by
 * `staleTime`, coalesces concurrent loads, and (with a loader that declares a
 * param) is scoped per `params` (one scope retained at a time — not a multi-key
 * cache). Wrapping with `loader()` keeps the loader machinery tree-shakeable —
 * a plain `entityMap()` never pays for it. Without `load` it's a plain
 * normalized client collection.
 *
 * @example Plain (client-side)
 * ```typescript
 * const tree = signalTree({ users: entityMap<User, number>() });
 * tree.$.users.addOne({ id: 1, name: 'Alice' });
 * ```
 *
 * @example Cache-aware (self-loading)
 * ```typescript
 * import { signalTree, entityMap, loader } from '@signaltree/core';
 *
 * const tree = signalTree({
 *   plants: entityMap<Plant, string>({
 *     selectId: (p) => p.url,
 *     load: loader(() => plantApi.list$(), { staleTime: '30m', tags: ['plants'] }),
 *   }),
 * });
 * await tree.$.plants.load();   // guarded — no-op while fresh / in-flight
 * ```
 *
 * @example Scoped (parameterized)
 * ```typescript
 * const tree = signalTree({
 *   customers: entityMap<Customer, string, { regionUrl: string }>({
 *     selectId: (c) => c.externalId,
 *     load: loader(({ regionUrl }) => api.getCustomers$(regionUrl), { staleTime: '30m' }),
 *   }),
 * });
 * await tree.$.customers.load({ regionUrl });  // per-scope freshness
 * ```
 *
 * @see RFC 0002, RFC 0003, RFC 0005
 */
// Overload order matters: the LOADING overload is declared first so a config
// carrying `load: loader(...)` resolves to a loading builder (recovering `P`
// from the feature); the PLAIN overload is declared LAST so that
// `ReturnType<typeof entityMap<E, K>>` (a common user idiom, and what the demos
// use) resolves to the plain builder rather than the loading one.
export function entityMap<
  E,
  K extends string | number = DefaultKey<E>,
  P = void
>(
  config: EntityConfig<E, K> & { load: LoaderFeature<E, P> }
): LoadingEntityMapBuilder<E, K, P, Record<string, never>>;
export function entityMap<E, K extends string | number = DefaultKey<E>>(
  config?: EntityConfig<E, K>
): EntityMapBuilder<E, K, Record<string, never>>;
export function entityMap<E, K extends string | number = DefaultKey<E>>(
  config?: EntityConfig<E, K> & { load?: LoaderFeature<E, unknown> }
): EntityMapBuilder<E, K, Record<string, never>> {
  // Fail closed at the call site (v12): `load` must be a `loader()` feature.
  // Checked HERE, synchronously, rather than in the marker processor —
  // `materializeMarkers()` wraps `processor.create()` in a try/catch that
  // swallows throws (dev console.error, silent in prod), so a processor-level
  // throw would not actually fail closed. Throwing in the factory surfaces the
  // error where the user wrote `entityMap({ load: fn })`, and cannot be
  // swallowed. Raw `load: fn` was removed in v12 (RFC 0005 §6). [ST2004]
  const rawLoad = (config as { load?: unknown } | undefined)?.load;
  if (rawLoad != null && !isLoaderFeature(rawLoad)) {
    throw new Error(
      `SignalTree: entityMap({ load }) requires the loader() helper — ` +
        `entityMap({ load: loader(fn, { staleTime, swr, tags }) }). The raw ` +
        `"load: fn" form was removed in v12 so the loader machinery ` +
        `tree-shakes out of plain collections. [ST2004]`
    );
  }

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

        // Cache-aware loading — reached ONLY through a `loader()` feature, the
        // sole holder of the `attachLoader` reference. This file does not
        // import `attachLoader`, so a plain `entityMap()` tree-shakes the
        // loader machinery out (RFC 0005 §6). A non-feature `load` is rejected
        // at the `entityMap()` call site (fail-closed [ST2004]), so by the time
        // the processor runs `load` is either absent or a loader feature.
        const load = cfg.load;
        if (isLoaderFeature(load)) {
          load.attach(
            entitySignal as EntitySignal<
              Record<string, unknown>,
              string | number
            >
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
