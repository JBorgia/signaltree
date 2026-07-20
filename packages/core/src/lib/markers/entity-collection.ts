import {
  computed,
  DestroyRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isObservable, type Observable, Subscription } from 'rxjs';

import { createEntitySignal } from '../entity-signal';
import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';
import type { PathNotifier } from '../path-notifier';
import type { EntityConfig, EntitySignal } from '../types';

// =============================================================================
// SYMBOLS
// =============================================================================

/** Brands the marker placeholder. Distinct from entityMap's `__isEntityMap`. */
export const ENTITY_COLLECTION_MARKER = Symbol('ENTITY_COLLECTION_MARKER');

/**
 * Brands the *materialized* signal so `invalidateTag()` can find collections by
 * walking `tree.$` — no global registry, so nothing to leak on tree teardown.
 * @internal
 */
export const ENTITY_COLLECTION_SIGNAL = Symbol('ENTITY_COLLECTION_SIGNAL');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Loader for a collection — resolves to the full array of rows. Receives the
 * scope `params` for keyed collections; `void` (call with no argument) for the
 * global, parameterless form.
 */
export type EntityCollectionLoader<E, P = void> = (
  params: P
) => Observable<E[]> | Promise<E[]>;

/**
 * Minimal structural storage contract for {@link EntityCollectionConfig.persist}.
 * Satisfied by `createIndexedDBAdapter()` from `@signaltree/core`'s persistence
 * enhancer, `localStorage`, or any custom adapter. Declared structurally here so
 * the marker does not depend on the enhancer module.
 */
export interface EntityCollectionStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Persistence option — see RFC 0002 §4.4 / RFC 0003 §persist. */
export type EntityCollectionPersist =
  | false
  | {
      adapter: EntityCollectionStorageAdapter;
      key: string;
      /**
       * When true, seed rows from the persisted snapshot instantly (offline-first),
       * mark stale, and revalidate via `load()` in the background. For unkeyed
       * collections this happens on materialize; for keyed collections it happens
       * on the first `load(params)` for each scope (sync adapters seed before the
       * fetch; async adapters seed as soon as the read resolves). Default: `false`
       * (write-through cache only).
       */
      hydrateThenRevalidate?: boolean;
    };

/**
 * Configuration for an {@link entityCollection} marker.
 *
 * @typeParam P - scope/params type. Defaults to `void` (the global,
 *   parameterless form). Provide a `key` function to make the collection keyed;
 *   `staleTime` freshness is then evaluated against the current scope key.
 */
export interface EntityCollectionConfig<
  E,
  K extends string | number = string,
  P = void
> {
  /** The fetch — resolves to the full array of rows for the given scope. */
  load: EntityCollectionLoader<E, P>;
  /**
   * Freshness key for the current scope. Its presence makes the collection
   * *keyed*: `staleTime` is checked against this key, and a key change marks the
   * collection stale and refetches. Return a JSON-stable, order-sensitive array
   * (like TanStack Query's `queryKey`) — e.g. `({ regionUrl }) => [regionUrl]`.
   */
  key?: (params: P) => unknown[];
  /** Identity selector (default: `entity.id`, same as {@link entityMap}). */
  selectId?: (entity: E) => K;
  /** Optional stable sort applied to collection reads. */
  sortComparer?: (a: E, b: E) => number;
  /**
   * If true, skip the initial auto-load — call `.load()` to trigger.
   * Default: `false` for unkeyed collections (load on materialize). Keyed
   * collections are always lazy (no params are available at materialize time).
   */
  lazy?: boolean;
  /**
   * Freshness window. `load()` is a no-op while the current scope's data is
   * younger than this. Accepts ms (`30000`) or a duration string (`'30m'`,
   * `'90s'`, `'2h'`, `'500ms'`). Default `0` — always stale.
   */
  staleTime?: number | string;
  /**
   * Stale-while-revalidate. When true, revalidation after `invalidate()` keeps
   * `loaded` true (serve last value, no flip). Default `false`.
   */
  swr?: boolean;
  /**
   * When the scope key changes, clear the rows immediately (and drop to a
   * not-loaded/loading state) instead of keeping the previous scope's rows until
   * the new load settles. Default `false` (keep-until-settled — no flicker).
   */
  clearOnKeyChange?: boolean;
  /** Register under these tags for {@link invalidateTag}. */
  tags?: string[];
  /** Persistence / offline-first hydration — see {@link EntityCollectionPersist}. */
  persist?: EntityCollectionPersist;
}

/**
 * Marker placeholder that materializes into an {@link EntityCollectionSignal}.
 */
export interface EntityCollectionMarker<
  E,
  K extends string | number = string,
  P = void
> {
  [ENTITY_COLLECTION_MARKER]: true;
  config: EntityCollectionConfig<E, K, P>;
  /** Phantom types for inference. */
  readonly __entityType?: E;
  readonly __keyType?: K;
  readonly __paramsType?: P;
}

/**
 * The materialized collection accessor — the full {@link EntitySignal} surface
 * (all CRUD + query signals) plus cache-aware, optionally scope-keyed loading.
 *
 * For the parameterless form (`P = void`) call `load()` with no argument. For a
 * keyed collection, `load(params)` requires the scope argument.
 *
 * @see RFC 0002 §4.2, RFC 0003
 */
export interface EntityCollectionSignal<
  E,
  K extends string | number = string,
  P = void
> extends EntitySignal<E, K> {
  /**
   * Guarded load. No-op if the current scope is fresh OR a load for the same
   * key is already in flight (single-flight). A different key supersedes any
   * in-flight load and refetches.
   */
  load(params: P): Promise<void>;
  /**
   * Force a reload, ignoring `staleTime` and key-match. Still single-in-flight.
   * Omit `params` to re-run the last-loaded scope.
   */
  refresh(params?: P): Promise<void>;
  /** Mark the current scope stale. Does not fetch — the next `load()` does. */
  invalidate(): void;

  /** True while a fetch is in flight. */
  readonly loading: Signal<boolean>;
  /** True once loaded and considered fresh (see `swr`). */
  readonly loaded: Signal<boolean>;
  /** Last error, or null. */
  readonly error: Signal<unknown | null>;
  /** Epoch ms of the last successful load; null until first success. */
  readonly lastLoadedAt: Signal<number | null>;
  /**
   * The serialized key of the currently-loaded scope, or null (always null for
   * unkeyed collections).
   */
  readonly currentKey: Signal<string | null>;
}

// =============================================================================
// DURATION PARSING
// =============================================================================

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a `staleTime` value to milliseconds. Numbers pass through; strings like
 * `'30m'` / `'500ms'` are parsed. Throws (dev) on an unknown unit.
 * @internal
 */
export function parseDuration(value: number | string | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.max(0, value);
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      throw new Error(
        `[SignalTree] entityCollection: invalid staleTime "${value}". ` +
          `Use a number (ms) or a duration string like '30m', '90s', '500ms'.`
      );
    }
    return 0;
  }
  return parseFloat(match[1]) * DURATION_UNITS[match[2]];
}

/**
 * Deterministic JSON serialization (object keys sorted at every level) so a key
 * function that returns equal-by-value scopes yields an identical string
 * regardless of property insertion order.
 * @internal
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const kk of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[kk] = (val as Record<string, unknown>)[kk];
      }
      return sorted;
    }
    return val;
  });
}

// =============================================================================
// MARKER FACTORY (self-registering for tree-shaking)
// =============================================================================

let entityCollectionRegistered = false;

/**
 * Creates an `entityCollection` marker — a cache-aware, optionally scope-keyed
 * entity-collection loader. Composes {@link entityMap} (full CRUD + query
 * surface) with a loader, load status, a per-scope freshness guard, single-flight
 * dedup, tag-based invalidation, and optional offline-first persistence.
 *
 * @example Global (parameterless)
 * ```typescript
 * const tree = signalTree({
 *   plants: entityCollection<Plant, string>({
 *     load: () => plantApi.list$(),
 *     selectId: (p) => p.url,
 *     staleTime: '30m',
 *     tags: ['plants'],
 *   }),
 * });
 * await tree.$.plants.load();      // guarded — no-op while fresh / in-flight
 * ```
 *
 * @example Keyed (scope-parameterized)
 * ```typescript
 * const tree = signalTree({
 *   customers: entityCollection<Customer, string, { regionUrl: string }>({
 *     load: ({ regionUrl }) => api.getCustomers$(regionUrl),
 *     key: ({ regionUrl }) => [regionUrl],   // freshness keyed by scope
 *     selectId: (c) => c.externalId,
 *     staleTime: '30m',
 *   }),
 * });
 * await tree.$.customers.load({ regionUrl });   // same key+fresh → no-op; key changed → refetch
 * ```
 *
 * @see RFC 0002, RFC 0003
 */
export function entityCollection<
  E,
  K extends string | number = string,
  P = void
>(config: EntityCollectionConfig<E, K, P>): EntityCollectionMarker<E, K, P> {
  if (!entityCollectionRegistered) {
    entityCollectionRegistered = true;
    registerBuiltinMarkerProcessor(
      isEntityCollectionMarker,
      createEntityCollectionSignal as (
        marker: EntityCollectionMarker<unknown, string | number, unknown>,
        notifier: PathNotifier,
        path: string
      ) => unknown
    );
  }
  return {
    [ENTITY_COLLECTION_MARKER]: true,
    config,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

export function isEntityCollectionMarker(
  value: unknown
): value is EntityCollectionMarker<unknown, string | number, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    ENTITY_COLLECTION_MARKER in value &&
    (value as Record<symbol, unknown>)[ENTITY_COLLECTION_MARKER] === true
  );
}

// =============================================================================
// SIGNAL FACTORY (materializer)
// =============================================================================

/**
 * Materializes an {@link EntityCollectionMarker} into a working
 * {@link EntityCollectionSignal}. Called by the tree walker during
 * `signalTree()` construction.
 */
export function createEntityCollectionSignal<
  E extends Record<string, unknown>,
  K extends string | number = string,
  P = void
>(
  marker: EntityCollectionMarker<E, K, P>,
  notifier: PathNotifier,
  path: string
): EntityCollectionSignal<E, K, P> {
  const {
    load: loadFn,
    key: keyFn,
    selectId,
    sortComparer,
    staleTime,
    swr = false,
    clearOnKeyChange = false,
    tags,
    persist = false,
  } = marker.config;

  const keyed = typeof keyFn === 'function';
  // Keyed collections cannot auto-load (no params available at materialize).
  const lazy = keyed ? true : marker.config.lazy ?? false;
  const staleMs = parseDuration(staleTime);

  // Base entity surface (all/byId/where/addOne/setAll/...).
  const entity = createEntitySignal<E, K>(
    { selectId, sortComparer } as EntityConfig<E, K>,
    notifier,
    path
  );

  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<unknown | null>(null);
  const lastLoadedAtSignal = signal<number | null>(null);
  const currentKeySignal = signal<string | null>(null);
  const invalidated = signal<boolean>(false);

  const loaded = computed(
    () => lastLoadedAtSignal() !== null && (swr || !invalidated())
  );

  // Internal freshness bookkeeping. `loadedKey` is the key of the last
  // *successful* load (null for unkeyed, or before the first load).
  let loadedKey: string | null = null;
  let lastParams: P | undefined = undefined;
  const hydratedKeys = new Set<string>();

  let inFlight: Promise<void> | null = null;
  let inFlightKey: string | null = null;
  let inFlightResolve: (() => void) | null = null;
  let runId = 0;
  let currentSub: Subscription | null = null;
  let destroyed = false;

  let destroyRef: DestroyRef | null = null;
  try {
    destroyRef = inject(DestroyRef, { optional: true }) ?? null;
  } catch {
    destroyRef = null;
  }
  destroyRef?.onDestroy(() => {
    destroyed = true;
    currentSub?.unsubscribe();
    currentSub = null;
    inFlight = null;
    inFlightKey = null;
    inFlightResolve = null;
  });

  const keyOf = (params: P): string | null =>
    keyFn ? stableStringify(keyFn(params)) : null;

  const storageKey = (k: string | null): string => {
    const base = persist ? persist.key : '';
    return keyed && k !== null ? `${base}::${k}` : base;
  };

  function isStale(k: string | null): boolean {
    if (lastLoadedAtSignal() === null) return true;
    if (invalidated()) return true;
    if (k !== loadedKey) return true; // scope changed (null===null for unkeyed)
    if (staleMs <= 0) return true;
    return Date.now() - (lastLoadedAtSignal() as number) >= staleMs;
  }

  function writeThrough(k: string | null): void {
    if (!persist) return;
    try {
      void persist.adapter.setItem(storageKey(k), JSON.stringify(entity.all()));
    } catch {
      // Persistence is best-effort; never let a storage failure break loads.
    }
  }

  function seedFromSnapshot(raw: string | null): void {
    if (destroyed || raw == null) return;
    try {
      const rows = JSON.parse(raw) as E[];
      if (Array.isArray(rows)) entity.setAll(rows);
      // Intentionally do NOT set lastLoadedAt — seeded data is stale.
    } catch {
      // Corrupt snapshot: ignore and let the loader repopulate.
    }
  }

  function runLoad(k: string | null, params: P): Promise<void> {
    if (destroyed) return Promise.resolve();

    // Supersede any in-flight load (different key / forced refresh): cancel the
    // observable and release the previous promise's awaiters so they never hang.
    currentSub?.unsubscribe();
    currentSub = null;
    const prevResolve = inFlightResolve;
    inFlightResolve = null;
    inFlight = null;

    const myRun = ++runId;
    inFlightKey = k;
    loadingSignal.set(true);
    errorSignal.set(null);

    let resolveP!: () => void;
    const p = new Promise<void>((resolve) => {
      resolveP = resolve;
    });
    inFlightResolve = resolveP;

    let settled = false;
    let settledSync = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      settledSync = true; // if this ran synchronously, we won't publish `p`
      if (inFlight === p) inFlight = null;
      if (inFlightKey === k) inFlightKey = null;
      if (inFlightResolve === resolveP) inFlightResolve = null;
      resolveP();
    };
    const settleSuccess = (rows: E[]): void => {
      if (destroyed || myRun !== runId) return; // superseded → don't write
      entity.setAll(rows);
      lastLoadedAtSignal.set(nowMs());
      loadedKey = k;
      currentKeySignal.set(keyed ? k : null);
      invalidated.set(false);
      loadingSignal.set(false);
      lastParams = params;
      writeThrough(k);
      done();
    };
    const settleError = (err: unknown): void => {
      if (destroyed || myRun !== runId) return;
      errorSignal.set(err);
      loadingSignal.set(false);
      done();
    };

    let result: Observable<E[]> | Promise<E[]> | undefined;
    try {
      result = loadFn(params);
    } catch (err) {
      settleError(err);
    }

    // result is defined unless loadFn threw (handled synchronously above).
    if (result !== undefined && !settled) {
      const r = result;
      if (isObservable(r)) {
        const obs = destroyRef ? r.pipe(takeUntilDestroyed(destroyRef)) : r;
        currentSub = obs.subscribe({
          next: (rows) => settleSuccess(rows),
          error: (err) => settleError(err),
          complete: () => {
            if (destroyed || myRun !== runId) return;
            loadingSignal.set(false);
            done();
          },
        });
      } else {
        r.then(
          (rows) => settleSuccess(rows),
          (err) => settleError(err)
        );
      }
    }

    // Only publish the latch if the load is still pending; a synchronous loader
    // has already settled (and nulled inFlight) via done() above.
    if (!settledSync) {
      inFlight = p;
      void p.finally(() => {
        if (inFlight === p) {
          inFlight = null;
          inFlightKey = null;
        }
      });
    }

    // Release the awaiters of the superseded load, if any.
    if (prevResolve) prevResolve();
    return p;
  }

  function maybeClearOnKeyChange(k: string | null): void {
    if (clearOnKeyChange && loadedKey !== null && k !== loadedKey) {
      entity.setAll([]);
      lastLoadedAtSignal.set(null); // drop to a not-loaded state during the load
      loadedKey = null;
    }
  }

  function beginLoad(k: string | null, params: P): Promise<void> {
    maybeClearOnKeyChange(k);
    // Keyed offline-first: seed this scope's snapshot before revalidating.
    if (
      persist &&
      persist.hydrateThenRevalidate &&
      keyed &&
      !hydratedKeys.has(k as string)
    ) {
      hydratedKeys.add(k as string);
      let got: string | null | Promise<string | null> = null;
      try {
        got = persist.adapter.getItem(storageKey(k));
      } catch {
        got = null;
      }
      if (got instanceof Promise) {
        return got
          .then((raw) => {
            seedFromSnapshot(raw);
          }, () => undefined)
          .then(() => runLoad(k, params));
      }
      seedFromSnapshot(got);
    }
    return runLoad(k, params);
  }

  function load(params: P): Promise<void> {
    const k = keyOf(params);
    if (inFlight && inFlightKey === k) return inFlight; // same-key coalesce
    if (!isStale(k)) return Promise.resolve(); // freshness guard
    return beginLoad(k, params);
  }

  function refresh(params?: P): Promise<void> {
    const hasArg = params !== undefined;
    const resolved = (hasArg ? params : lastParams) as P;
    if (keyed && !hasArg && lastParams === undefined) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          '[SignalTree] entityCollection.refresh() called with no params on a ' +
            'keyed collection that has never loaded — nothing to refresh.'
        );
      }
      return Promise.resolve();
    }
    const k = keyOf(resolved);
    if (inFlight && inFlightKey === k) return inFlight; // still single-in-flight
    return beginLoad(k, resolved);
  }

  function invalidate(): void {
    // Mark the current scope stale only — does not fetch (RFC 0002 §7).
    invalidated.set(true);
  }

  // --- unkeyed offline-first hydration (persist.hydrateThenRevalidate) ------
  let hydrating: Promise<void> | null = null;
  if (persist && persist.hydrateThenRevalidate && !keyed) {
    try {
      const got = persist.adapter.getItem(storageKey(null));
      hydrating =
        got instanceof Promise
          ? got.then((raw) => seedFromSnapshot(raw), () => undefined)
          : (seedFromSnapshot(got), Promise.resolve());
    } catch {
      hydrating = Promise.resolve();
    }
  }

  // --- initial load (unkeyed, non-lazy only) --------------------------------
  if (!lazy) {
    if (hydrating) {
      void hydrating.then(() => {
        if (!destroyed) void load(undefined as P);
      });
    } else {
      void load(undefined as P);
    }
  }

  // Attach loader surface onto the entity signal.
  const target = entity as EntityCollectionSignal<E, K, P>;
  target.load = load;
  target.refresh = refresh;
  target.invalidate = invalidate;
  Object.defineProperty(target, 'loading', {
    value: loadingSignal.asReadonly(),
  });
  Object.defineProperty(target, 'loaded', { value: loaded });
  Object.defineProperty(target, 'error', { value: errorSignal.asReadonly() });
  Object.defineProperty(target, 'lastLoadedAt', {
    value: lastLoadedAtSignal.asReadonly(),
  });
  Object.defineProperty(target, 'currentKey', {
    value: currentKeySignal.asReadonly(),
  });

  // Brand + tags for invalidateTag()'s tree walk.
  Object.defineProperty(target, ENTITY_COLLECTION_SIGNAL, { value: true });
  Object.defineProperty(target, '__tags', {
    value: tags ? new Set(tags) : null,
  });

  return target;
}

function nowMs(): number {
  return Date.now();
}

// =============================================================================
// TAG-BASED INVALIDATION (RFC 0002 §4.3)
// =============================================================================

interface TaggedCollection {
  [ENTITY_COLLECTION_SIGNAL]: true;
  __tags: Set<string> | null;
  invalidate(): void;
}

function isTaggedCollection(value: unknown): value is TaggedCollection {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    (value as Record<symbol, unknown>)[ENTITY_COLLECTION_SIGNAL] === true
  );
}

/**
 * Invalidate every {@link entityCollection} in `tree` that carries `tag`.
 * Walks `tree.$` (no global registry — nothing to leak on teardown). The clean
 * seam for push-driven freshness: an SSE/SignalR "plants changed" event →
 * `invalidateTag(tree, 'plants')` → subscribed collections mark stale. Applies
 * to keyed collections too (marks the currently-loaded scope stale).
 *
 * @returns the number of collections invalidated.
 * @see RFC 0002 §4.3
 */
export function invalidateTag(
  tree: { $: unknown } | { state: unknown },
  tag: string
): number {
  const root =
    ('$' in tree ? tree.$ : undefined) ??
    ('state' in tree ? tree.state : undefined);
  if (root == null) return 0;

  let count = 0;
  const visited = new WeakSet<object>();

  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node !== 'object' && typeof node !== 'function') return;
    if (visited.has(node as object)) return;
    visited.add(node as object);

    if (isTaggedCollection(node)) {
      if (node.__tags && node.__tags.has(tag)) {
        node.invalidate();
        count++;
      }
      return; // don't descend into a materialized collection
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      walk((node as Record<string, unknown>)[key]);
    }
  };

  walk(root);
  return count;
}
