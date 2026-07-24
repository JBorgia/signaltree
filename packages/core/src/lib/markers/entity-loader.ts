import {
  computed,
  DestroyRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import type { Observable, Subscription } from 'rxjs';

/**
 * rxjs-free Observable check: the loader accepts `Promise | Observable`, and
 * a Promise never has `.subscribe`, so the duck test is unambiguous here.
 * Keeps rxjs (and rxjs-interop) TYPE-ONLY dependencies of the loader — no
 * runtime module edge for Promise-only consumers (RFC 0005 §6). The former
 * `takeUntilDestroyed` pipe was redundant: the `destroyRef.onDestroy` hook
 * below (registered before any subscribe) unsubscribes `currentSub` first,
 * and every settle callback additionally guards `destroyed`/run-id.
 */
function isSubscribable<T>(
  v: Promise<T> | Observable<T>
): v is Observable<T> {
  return typeof (v as { subscribe?: unknown }).subscribe === 'function';
}

import { isTraversableNode } from '../utils';
import type { EntitySignal } from '../types';

/**
 * Cache-aware (single-scope) loading for `entityMap`.
 *
 * `entityMap({ load: loader(fn, { staleTime, … }) })` turns a plain normalized
 * collection into a self-loading, cache-aware one: a loader, load status, a
 * per-scope freshness guard, single-flight dedup, tag-based invalidation, and
 * optional offline-first persistence — all attached to the same `EntitySignal`
 * surface. This module holds the loader machinery; `attachLoader` is reachable
 * ONLY through the `loader()` helper (`./loader`), so a plain `entityMap()`
 * never pulls it in unless the app also uses a loading collection (v12,
 * RFC 0005 §6). The loader-family options (`staleTime`/`swr`/`tags`/`persist`/
 * `equal`/`lazy`/`clearOnParamsChange`) are passed to `loader()`, not to
 * `entityMap` directly.
 *
 * @see RFC 0002, RFC 0003, RFC 0005
 */

// =============================================================================
// SYMBOL
// =============================================================================

/**
 * Brands a materialized *loading* entityMap so `invalidateTag()` can find them by
 * walking `tree.$` — no global registry, so nothing to leak on tree teardown.
 * @internal
 */
export const ENTITY_LOADER_SIGNAL = Symbol('ENTITY_LOADER_SIGNAL');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Loader — resolves to the full array of rows. Receives the scope `params` for
 * scoped collections; `void` (call with no argument) for the global form.
 */
export type EntityLoader<E, P = void> = (
  params: P
) => Observable<E[]> | Promise<E[]>;

/**
 * Minimal structural storage contract for {@link EntityLoadOptions.persist}.
 * Satisfied by `createIndexedDBAdapter()`, `localStorage`, or any custom adapter.
 */
export interface EntityStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Persistence / offline-first hydration option. */
export type EntityPersist =
  | false
  | {
      adapter: EntityStorageAdapter;
      key: string;
      /**
       * Seed rows from the persisted snapshot (offline-first), mark stale, and
       * revalidate via `load()` in the background. Global collections seed on
       * materialize; scoped collections seed on the first `load(params)` per
       * scope. Default: `false` (write-through cache only).
       */
      hydrateThenRevalidate?: boolean;
      /**
       * Storage garbage collection for **scoped** collections (a loader that
       * declares a params argument). Each scope persists under its own storage
       * key (`key::<stableStringify(params)>`), so high-cardinality scopes —
       * tenants, customers, searches — accumulate entries forever by default.
       *
       * When set, the loader maintains a touch-ordered index of persisted
       * scope keys under `` `${key}::__scopes` `` (JSON array, most-recent
       * last). Every successful write-through moves the current scope to the
       * index tail; once the index exceeds `maxScopes`, the oldest scopes are
       * dropped from the index and their storage entries removed via
       * `adapter.removeItem`. Same best-effort posture as write-through
       * itself: adapter failures never break the load path, and a pruned
       * scope simply misses hydration and loads fresh on its next visit.
       *
       * Unset (default) = no GC, exactly the previous behavior — the
       * application owns cleanup (see `docs/guides/persistence-guide.md`,
       * "Persisted-scope cleanup"). Ignored on global (parameterless)
       * collections, which persist a single entry under `key`.
       *
       * This is storage GC only — in-memory multi-scope LRU *caching* remains
       * deferred (RFC 0003 §5); the in-memory cache is still single-scope.
       */
      maxScopes?: number;
    };

/**
 * Cache-aware loading options for {@link entityMap}. Presence of `load` turns a
 * plain collection into a loading one.
 */
export interface EntityLoadOptions<E, P = void> {
  /** The fetch — resolves to the full array of rows for the given scope. */
  load: EntityLoader<E, P>;
  /**
   * Equality for scope params (mirrors `asyncQuery`/`asyncStream`). When the new
   * `load(params)` scope is not equal to the loaded one, the collection is stale
   * and refetches. Default: a structural value comparison (object literals compare
   * by value). A loader that declares a parameter (`load: (p) => …`) is *scoped*.
   */
  equal?: (a: P, b: P) => boolean;
  /**
   * If true, skip the initial auto-load — call `.load()` to trigger. Default:
   * `false` for global collections; scoped collections are always lazy.
   */
  lazy?: boolean;
  /**
   * Freshness window. `load()` is a no-op while the current scope's data is
   * younger than this. Accepts ms or a duration string (`'30m'`, `'90s'`, …).
   * Default `0` — always stale.
   */
  staleTime?: number | string;
  /**
   * Stale-while-revalidate. When true, revalidation after `invalidate()` keeps
   * `loaded` true (serve last value, no flip). Default `false`.
   */
  swr?: boolean;
  /**
   * When the scope changes, clear the rows immediately (and drop to a
   * not-loaded/loading state) instead of keeping the previous scope's rows until
   * the new load settles. Default `false` (keep-until-settled — no flicker).
   */
  clearOnParamsChange?: boolean;
  /** Register under these tags for {@link invalidateTag}. */
  tags?: string[];
  /** Persistence / offline-first hydration — see {@link EntityPersist}. */
  persist?: EntityPersist;
}

/**
 * The loader surface added to an {@link EntitySignal} when `load` is configured.
 * For the parameterless form (`P = void`) call `load()`; a scoped collection
 * requires `load(params)`.
 */
export interface EntityLoaderSurface<P = void> {
  /**
   * Guarded load: no-op if fresh OR the same scope is already in flight.
   * If the materializing injector is destroyed while a load is in flight,
   * the promise resolves (rows are dropped, `loading()` flips false).
   */
  load(params: P): Promise<void>;
  /**
   * Same as `load()`, but rejects with the loader's error instead of only
   * surfacing it through `.error()`. `load()` always resolves — even on
   * failure — so template/signal consumers never see an unhandled rejection;
   * `loadOrThrow()` is for imperative call sites that want conventional
   * `await`/`try-catch` orchestration instead. Destroy during flight resolves
   * (not rejects): `.error()` stays null — a torn-down scope is not a failure.
   */
  loadOrThrow(params: P): Promise<void>;
  /** Force a reload, ignoring `staleTime`/scope-match. Omit `params` to re-run the last scope. */
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
  /** The typed scope of the currently-loaded data; `undefined` for a global collection or before first load. */
  readonly params: Signal<P | undefined>;
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
        `[SignalTree] entityMap: invalid staleTime "${value}". ` +
          `Use a number (ms) or a duration string like '30m', '90s', '500ms'.`
      );
    }
    return 0;
  }
  return parseFloat(match[1]) * DURATION_UNITS[match[2]];
}

/**
 * Deterministic JSON serialization (object keys sorted at every level). Used for
 * the default `equal` comparator and per-scope persist storage keys — never
 * exposed on the public signal surface.
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

function defaultEqual<P>(a: P, b: P): boolean {
  return a === b || stableStringify(a) === stableStringify(b);
}

function nowMs(): number {
  return Date.now();
}

// =============================================================================
// ATTACH LOADER
// =============================================================================

/**
 * Attach the cache-aware loader surface (see {@link EntityLoaderSurface}) onto an
 * existing {@link EntitySignal}. Called by `entityMap`'s materializer when `load`
 * is configured.
 *
 * **NG0600 safety:** SignalTree finalizes markers lazily on first `.$` access —
 * frequently a template read *during* Angular's render — so the initial auto-load
 * and offline-first seed are deferred to a microtask; no signal writes happen
 * synchronously during materialization.
 *
 * @internal
 */
export function attachLoader<
  E extends Record<string, unknown>,
  K extends string | number,
  P = void
>(entity: EntitySignal<E, K>, options: EntityLoadOptions<E, P>): void {
  const {
    load: loadFn,
    equal,
    staleTime,
    swr = false,
    clearOnParamsChange = false,
    tags,
    persist = false,
  } = options;

  // A loader that declares a parameter is "scoped" — it needs a scope before it
  // can load, so it is always lazy.
  const scoped = loadFn.length > 0;
  const lazy = scoped ? true : options.lazy ?? false;
  const staleMs = parseDuration(staleTime);
  const equalFn: (a: P, b: P) => boolean = equal ?? defaultEqual;

  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<unknown | null>(null);
  const lastLoadedAtSignal = signal<number | null>(null);
  const paramsSignal = signal<P | undefined>(undefined);
  const invalidated = signal<boolean>(false);

  const loaded = computed(
    () => lastLoadedAtSignal() !== null && (swr || !invalidated())
  );

  let loadedParams: P | undefined = undefined;
  let lastParams: P | undefined = undefined;
  let hasEverLoaded = false;
  const hydratedScopes = new Set<string>();

  let inFlight: Promise<void> | null = null;
  let inFlightParams: P | undefined = undefined;
  let hasInFlight = false;
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
    // Settle any caller-held `load()` promise. RESOLVE, not reject: `load()`
    // never rejects (errors surface via `.error()`), and after destroy the
    // settle callbacks are guarded out, so without this the promise would
    // hang forever. `loadOrThrow()` callers also resolve cleanly: its
    // post-await check reads `errorSignal`, which stays null — a destroyed
    // scope is "load ended with no data and no error", not a failure.
    const pendingResolve = inFlightResolve;
    inFlight = null;
    hasInFlight = false;
    inFlightResolve = null;
    pendingResolve?.();
    // The in-flight fetch will never settle now — don't leave `loading()`
    // stuck true on a destroyed (but still readable) tree.
    loadingSignal.set(false);
  });

  const scopeStorageKey = (params: P): string => {
    const base = persist ? persist.key : '';
    return scoped ? `${base}::${stableStringify(params)}` : base;
  };

  /**
   * Persisted-scope GC (see {@link EntityPersist.maxScopes}). Upserts the
   * scope's storage key at the MRU tail of the `${key}::__scopes` index and
   * evicts (index slot + `removeItem`) the oldest entries beyond `maxScopes`.
   * Fire-and-forget with the same best-effort posture as `writeThrough`: any
   * adapter failure — sync throw or rejected promise — is swallowed and never
   * breaks (or delays) the load path.
   */
  function touchScopeIndex(storageKey: string): void {
    const p = persist;
    if (!p || !scoped || p.maxScopes === undefined) return;
    const max = p.maxScopes;
    // Runtime safety net (prod builds strip the dev-throw in loader()): an
    // invalid maxScopes must NOT run GC — a value < 1 would evict every scope
    // on each write-through and silently wipe the persisted cache. Treat any
    // non-positive-integer as "no GC" (identical to leaving maxScopes unset),
    // the safe default. The loader() factory still throws on it in dev.
    // Runtime safety net (prod builds strip the dev-throw in loader()): an
    // invalid maxScopes must NOT run GC — a value < 1 would evict every scope
    // on each write-through and silently wipe the persisted cache. Treat any
    // non-positive-integer as "no GC" (identical to leaving maxScopes unset),
    // the safe default. The loader() factory still throws on it in dev.
    if (!Number.isInteger(max) || max < 1) return;
    const indexKey = `${p.key}::__scopes`;
    try {
      void Promise.resolve(p.adapter.getItem(indexKey))
        .then((raw) => {
          let index: string[] = [];
          if (raw != null) {
            try {
              const parsed = JSON.parse(raw) as unknown;
              if (Array.isArray(parsed)) {
                index = parsed.filter((k): k is string => typeof k === 'string');
              }
            } catch {
              // Corrupt index: rebuild from scratch (entries orphaned by the
              // corruption are unreachable to GC but harmless — app-level
              // cleanup by `key::` prefix still applies).
            }
          }
          const at = index.indexOf(storageKey);
          if (at !== -1) index.splice(at, 1);
          index.push(storageKey);
          while (index.length > max) {
            const evicted = index.shift() as string;
            try {
              void Promise.resolve(p.adapter.removeItem(evicted)).catch(
                () => undefined
              );
            } catch {
              // Best-effort eviction; the index slot is dropped regardless.
            }
          }
          return Promise.resolve(
            p.adapter.setItem(indexKey, JSON.stringify(index))
          );
        })
        .catch(() => undefined);
    } catch {
      // Persistence is best-effort; never let a storage failure break loads.
    }
  }

  function isStale(params: P): boolean {
    if (lastLoadedAtSignal() === null) return true;
    if (invalidated()) return true;
    if (hasEverLoaded && !equalFn(loadedParams as P, params)) return true;
    if (staleMs <= 0) return true;
    return Date.now() - (lastLoadedAtSignal() as number) >= staleMs;
  }

  function writeThrough(params: P): void {
    if (!persist) return;
    const storageKey = scopeStorageKey(params);
    try {
      void persist.adapter.setItem(storageKey, JSON.stringify(entity.all()));
    } catch {
      // Persistence is best-effort; never let a storage failure break loads.
    }
    touchScopeIndex(storageKey);
  }

  function seedFromSnapshot(raw: string | null): void {
    if (destroyed || raw == null) return;
    try {
      const rows = JSON.parse(raw) as E[];
      if (Array.isArray(rows)) entity.setAll(rows);
    } catch {
      // Corrupt snapshot: ignore and let the loader repopulate.
    }
  }

  function runLoad(params: P): Promise<void> {
    if (destroyed) return Promise.resolve();

    currentSub?.unsubscribe();
    currentSub = null;
    const prevResolve = inFlightResolve;
    inFlightResolve = null;
    inFlight = null;
    hasInFlight = false;

    const myRun = ++runId;
    inFlightParams = params;
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
      settledSync = true;
      if (inFlight === p) {
        inFlight = null;
        hasInFlight = false;
      }
      if (inFlightResolve === resolveP) inFlightResolve = null;
      resolveP();
    };
    const settleSuccess = (rows: E[]): void => {
      if (destroyed || myRun !== runId) return;
      entity.setAll(rows);
      lastLoadedAtSignal.set(nowMs());
      loadedParams = params;
      lastParams = params;
      hasEverLoaded = true;
      paramsSignal.set(params);
      invalidated.set(false);
      loadingSignal.set(false);
      writeThrough(params);
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

    if (result !== undefined && !settled) {
      const r = result;
      if (isSubscribable(r)) {
        currentSub = r.subscribe({
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

    if (!settledSync) {
      inFlight = p;
      hasInFlight = true;
      void p.finally(() => {
        if (inFlight === p) {
          inFlight = null;
          hasInFlight = false;
        }
      });
    }

    if (prevResolve) prevResolve();
    return p;
  }

  function maybeClearOnParamsChange(params: P): void {
    if (
      clearOnParamsChange &&
      hasEverLoaded &&
      !equalFn(loadedParams as P, params)
    ) {
      entity.setAll([]);
      lastLoadedAtSignal.set(null);
      hasEverLoaded = false;
    }
  }

  function beginLoad(params: P): Promise<void> {
    lastParams = params;
    maybeClearOnParamsChange(params);
    if (persist && persist.hydrateThenRevalidate && scoped) {
      const sk = stableStringify(params);
      if (!hydratedScopes.has(sk)) {
        hydratedScopes.add(sk);
        let got: string | null | Promise<string | null> = null;
        try {
          got = persist.adapter.getItem(scopeStorageKey(params));
        } catch {
          got = null;
        }
        if (got instanceof Promise) {
          return got
            .then((raw) => seedFromSnapshot(raw), () => undefined)
            .then(() => runLoad(params));
        }
        seedFromSnapshot(got);
      }
    }
    return runLoad(params);
  }

  function load(params: P): Promise<void> {
    if (inFlight && hasInFlight && equalFn(inFlightParams as P, params)) {
      return inFlight;
    }
    if (!isStale(params)) return Promise.resolve();
    return beginLoad(params);
  }

  function refresh(params?: P): Promise<void> {
    const hasArg = params !== undefined;
    const resolved = (hasArg ? params : lastParams) as P;
    if (scoped && !hasArg && lastParams === undefined) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          '[SignalTree] entityMap.refresh() called with no params on a scoped ' +
            'collection that has never loaded — nothing to refresh.'
        );
      }
      return Promise.resolve();
    }
    if (inFlight && hasInFlight && equalFn(inFlightParams as P, resolved)) {
      return inFlight;
    }
    return beginLoad(resolved);
  }

  async function loadOrThrow(params: P): Promise<void> {
    await load(params);
    const err = errorSignal();
    if (err != null) throw err;
  }

  function invalidate(): void {
    invalidated.set(true);
  }

  // Deferred initial work (NG0600-safe: no signal writes at materialize).
  if (!lazy) {
    const kickoff = (): void => {
      if (destroyed) return;
      if (persist && persist.hydrateThenRevalidate && !scoped) {
        try {
          const got = persist.adapter.getItem(scopeStorageKey(undefined as P));
          if (got instanceof Promise) {
            void got.then(
              (raw) => {
                seedFromSnapshot(raw);
                if (!destroyed) void load(undefined as P);
              },
              () => {
                if (!destroyed) void load(undefined as P);
              }
            );
            return;
          }
          seedFromSnapshot(got);
        } catch {
          // fall through to load
        }
      }
      void load(undefined as P);
    };
    queueMicrotask(kickoff);
  }

  // Attach the loader surface onto the entity signal.
  const target = entity as EntitySignal<E, K> &
    EntityLoaderSurface<P> & { __tags?: Set<string> | null };
  target.load = load;
  target.loadOrThrow = loadOrThrow;
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
  Object.defineProperty(target, 'params', {
    value: paramsSignal.asReadonly(),
  });

  // Brand + tags for invalidateTag()'s tree walk.
  Object.defineProperty(target, ENTITY_LOADER_SIGNAL, { value: true });
  Object.defineProperty(target, '__tags', {
    value: tags ? new Set(tags) : null,
  });
}

// =============================================================================
// TAG-BASED INVALIDATION
// =============================================================================

interface TaggedCollection {
  [ENTITY_LOADER_SIGNAL]: true;
  __tags: Set<string> | null;
  invalidate(): void;
}

function isTaggedCollection(value: unknown): value is TaggedCollection {
  return (
    isTraversableNode(value) &&
    (value as Record<symbol, unknown>)[ENTITY_LOADER_SIGNAL] === true
  );
}

/**
 * Invalidate every loading `entityMap` in `tree` that carries `tag`. Walks
 * `tree.$` (no global registry — nothing to leak on teardown). The clean seam for
 * push-driven freshness: an SSE/SignalR "plants changed" event →
 * `invalidateTag(tree, 'plants')` → subscribed collections mark stale.
 *
 * @returns the number of collections invalidated.
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
    if (!isTraversableNode(node)) return;
    if (visited.has(node as object)) return;
    visited.add(node as object);

    if (isTaggedCollection(node)) {
      if (node.__tags && node.__tags.has(tag)) {
        node.invalidate();
        count++;
      }
      return;
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      walk((node as Record<string, unknown>)[key]);
    }
  };

  walk(root);
  return count;
}
