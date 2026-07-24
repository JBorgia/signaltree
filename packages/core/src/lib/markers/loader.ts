/**
 * `loader()` — the tree-shakeable way to make an {@link entityMap} cache-aware.
 *
 * ```ts
 * import { signalTree, entityMap, loader } from '@signaltree/core';
 *
 * const tree = signalTree({
 *   plants: entityMap<Plant, string>({
 *     selectId: (p) => p.url,
 *     load: loader(() => plantApi.list$(), { staleTime: '30m', swr: true, tags: ['plants'] }),
 *   }),
 * });
 * ```
 *
 * This helper is the ONLY module-level reference to `attachLoader` (and the
 * loader/cache/SWR/persistence machinery behind it) that a plain
 * `entityMap()` need never pull in. Because the reference lives inside the
 * value returned by `loader()`, a consumer that imports `entityMap` but not
 * `loader` tree-shakes the machinery out entirely. Exact `security()` precedent
 * (`@signaltree/core/security`).
 *
 * The legacy raw form — `entityMap({ load: () => api.list$(), staleTime })` —
 * was removed in v12 (RFC 0005 §6/§7): a raw function on `load` now fails
 * closed at the `entityMap()` call site with a coded `[ST2004]` error. Because
 * `entity-map.ts` no longer imports `attachLoader`, the reclaim is real — a
 * plain `entityMap()` (or any collection not built with `loader()`) does not
 * ship the loader machinery at all.
 *
 * @packageDocumentation
 */

import type { EntitySignal, LoaderFeature } from '../types';

import {
  attachLoader,
  type EntityLoadOptions,
  type EntityLoader,
} from './entity-loader';

/**
 * Loader-family options accepted by {@link loader} — every
 * {@link EntityLoadOptions} key except `load` itself (which is the first
 * argument). Moving these inside the helper keeps the plain `entityMap` config
 * surface small: a non-loading collection's config carries no loader keys.
 */
export type LoaderOptions<E, P = void> = Omit<EntityLoadOptions<E, P>, 'load'>;

/**
 * Build a {@link LoaderFeature} for `entityMap({ load: loader(fn, opts) })`.
 *
 * @param load - the fetch — resolves to the full array of rows for the given
 *   scope. Receives the scope `params` for scoped collections; call with no
 *   argument for the global form.
 * @param options - loader-family options ({@link LoaderOptions}):
 *   `staleTime`/`swr`/`tags`/`persist`/`equal`/`clearOnParamsChange`/`lazy`.
 *   For scoped collections, `persist.maxScopes` garbage-collects old persisted
 *   scope entries in *storage* (touch-ordered, best-effort). Note this is
 *   storage GC only — full multi-scope LRU *caching* (in-memory) remains a
 *   separate, deferred feature (RFC 0003 §5); the in-memory cache is still
 *   single-scope.
 *
 * @public
 */
// `E` is intentionally UNconstrained here — it must match `entityMap<E, K, P>`
// and `LoaderFeature<E, P>`, neither of which constrains `E`. Constraining it to
// `Record<string, unknown>` (as `attachLoader`'s internal signature does) would
// reject plain entity interfaces without an index signature (`Plant`, `User`, …)
// and silently widen `E` at the call site. The narrower constraint is satisfied
// internally by the casts at the `attachLoader` boundary — a runtime no-op.
export function loader<E, P = void>(
  load: EntityLoader<E, P>,
  options: LoaderOptions<E, P> = {}
): LoaderFeature<E, P> {
  // Validate HERE, synchronously, not in `attachLoader` — the marker
  // materializer wraps `processor.create()` in a try/catch that swallows
  // throws (same reasoning as entityMap's [ST2004] call-site check), so an
  // attach-time throw would not actually fail closed.
  const persist = options.persist;
  if (
    persist &&
    persist.maxScopes !== undefined &&
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    (!Number.isInteger(persist.maxScopes) || persist.maxScopes < 1)
  ) {
    throw new Error(
      `[SignalTree] loader: persist.maxScopes must be a positive integer ` +
        `(got ${String(persist.maxScopes)}).`
    );
  }
  return {
    __signalTreeLoader: true,
    attach(entity: unknown): void {
      attachLoader(
        entity as EntitySignal<Record<string, unknown>, string | number>,
        { load, ...options } as unknown as EntityLoadOptions<
          Record<string, unknown>,
          unknown
        >
      );
    },
  } as LoaderFeature<E, P>;
}
