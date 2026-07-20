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

/** Loader for a collection — resolves to the full array of rows. */
export type EntityCollectionLoader<E> = () => Observable<E[]> | Promise<E[]>;

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

/** Persistence option — see RFC 0002 §4.4. */
export type EntityCollectionPersist =
  | false
  | {
      adapter: EntityCollectionStorageAdapter;
      key: string;
      /**
       * When true, seed rows from the persisted snapshot instantly on
       * materialize (offline-first), mark stale, and revalidate via `load()` in
       * the background. Default: `false` (write-through cache only).
       */
      hydrateThenRevalidate?: boolean;
    };

/**
 * Configuration for an {@link entityCollection} marker.
 */
export interface EntityCollectionConfig<
  E,
  K extends string | number = string
> {
  /** The fetch — resolves to the full array of rows. */
  load: EntityCollectionLoader<E>;
  /** Identity selector (default: `entity.id`, same as {@link entityMap}). */
  selectId?: (entity: E) => K;
  /** Optional stable sort applied to collection reads. */
  sortComparer?: (a: E, b: E) => number;
  /**
   * If true, skip the initial auto-load — call `.load()` to trigger.
   * Default: `false` (loads when the tree is materialized).
   */
  lazy?: boolean;
  /**
   * Freshness window. `load()` is a no-op while data is younger than this.
   * Accepts ms (`30000`) or a duration string (`'30m'`, `'90s'`, `'2h'`,
   * `'500ms'`). Default `0` — always stale, so `load()` always refetches.
   */
  staleTime?: number | string;
  /**
   * Stale-while-revalidate. When true, revalidation after `invalidate()` keeps
   * `loaded` true (serve last value, no flip). Default `false`.
   */
  swr?: boolean;
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
  K extends string | number = string
> {
  [ENTITY_COLLECTION_MARKER]: true;
  config: EntityCollectionConfig<E, K>;
  /** Phantom types for inference. */
  readonly __entityType?: E;
  readonly __keyType?: K;
}

/**
 * The materialized collection accessor — the full {@link EntitySignal} surface
 * (all CRUD + query signals) plus cache-aware loading.
 *
 * @see RFC 0002 §4.2
 */
export interface EntityCollectionSignal<
  E,
  K extends string | number = string
> extends EntitySignal<E, K> {
  /** Guarded load: no-op if fresh OR already in-flight (single-flight). */
  load(): Promise<void>;
  /** Force a reload, ignoring `staleTime`. Still single-in-flight. */
  refresh(): Promise<void>;
  /** Mark stale. Does not fetch — the next `load()` (or a caller) does. */
  invalidate(): void;

  /** True while a fetch is in flight. */
  readonly loading: Signal<boolean>;
  /** True once loaded and considered fresh (see `swr`). */
  readonly loaded: Signal<boolean>;
  /** Last error, or null. */
  readonly error: Signal<unknown | null>;
  /** Epoch ms of the last successful load; null until first success. */
  readonly lastLoadedAt: Signal<number | null>;
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

// =============================================================================
// MARKER FACTORY (self-registering for tree-shaking)
// =============================================================================

let entityCollectionRegistered = false;

/**
 * Creates an `entityCollection` marker — a cache-aware entity-collection loader.
 * Composes {@link entityMap} (full CRUD + query surface) with a loader, load
 * status, a freshness guard, single-flight dedup, tag-based invalidation, and
 * optional offline-first persistence.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   plants: entityCollection<PlantDto, string>({
 *     load: () => plantApi.list$(region),
 *     selectId: (p) => p.url,
 *     staleTime: '30m',     // skip refetch while fresh
 *     tags: ['plants'],     // invalidateTag(tree, 'plants')
 *   }),
 * });
 *
 * tree.$.plants.all();       // PlantDto[] (entityMap surface)
 * tree.$.plants.loading();   // boolean
 * await tree.$.plants.load(); // guarded — no-op while fresh / in-flight
 * tree.$.plants.invalidate(); // mark stale; next load() refetches
 * ```
 *
 * @see RFC 0002
 */
export function entityCollection<E, K extends string | number = string>(
  config: EntityCollectionConfig<E, K>
): EntityCollectionMarker<E, K> {
  if (!entityCollectionRegistered) {
    entityCollectionRegistered = true;
    registerBuiltinMarkerProcessor(
      isEntityCollectionMarker,
      createEntityCollectionSignal as (
        marker: EntityCollectionMarker<unknown, string | number>,
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
): value is EntityCollectionMarker<unknown, string | number> {
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
  K extends string | number = string
>(
  marker: EntityCollectionMarker<E, K>,
  notifier: PathNotifier,
  path: string
): EntityCollectionSignal<E, K> {
  const {
    load: loadFn,
    selectId,
    sortComparer,
    lazy = false,
    staleTime,
    swr = false,
    tags,
    persist = false,
  } = marker.config;

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
  const invalidated = signal<boolean>(false);

  const loaded = computed(
    () => lastLoadedAtSignal() !== null && (swr || !invalidated())
  );

  let inFlight: Promise<void> | null = null;
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
  });

  function isStale(): boolean {
    if (lastLoadedAtSignal() === null) return true;
    if (invalidated()) return true;
    if (staleMs <= 0) return true;
    return Date.now() - (lastLoadedAtSignal() as number) >= staleMs;
  }

  function writeThrough(): void {
    if (!persist) return;
    try {
      void persist.adapter.setItem(persist.key, JSON.stringify(entity.all()));
    } catch {
      // Persistence is best-effort; never let a storage failure break loads.
    }
  }

  function runLoad(): Promise<void> {
    if (destroyed) return Promise.resolve();
    currentSub?.unsubscribe();
    currentSub = null;
    loadingSignal.set(true);
    errorSignal.set(null);

    // NOTE: the Promise executor runs synchronously, and a synchronous loader
    // (e.g. rxjs `of()`) settles *during* construction — before the
    // `inFlight = p` assignment below. If we cleared the latch only from inside
    // the executor, the later assignment would clobber the null back to a
    // resolved promise, and the next same-tick load() would wrongly dedupe
    // against it. So: track whether we settled synchronously, and only publish
    // `p` as the in-flight latch when the load is still pending after the
    // executor runs. Async settles clear the latch from done() (+ a guarded
    // finally as a backstop).
    let settledSync = false;
    const p = new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (!settled) {
          settled = true;
          settledSync = true; // if this runs during the executor, skip publishing p
          inFlight = null;
          resolve();
        }
      };
      const settleSuccess = (rows: E[]): void => {
        if (destroyed) return;
        entity.setAll(rows);
        lastLoadedAtSignal.set(Date.now());
        invalidated.set(false);
        loadingSignal.set(false);
        writeThrough();
        done();
      };
      const settleError = (err: unknown): void => {
        if (destroyed) return;
        errorSignal.set(err);
        loadingSignal.set(false);
        done();
      };

      let result: Observable<E[]> | Promise<E[]>;
      try {
        result = loadFn();
      } catch (err) {
        settleError(err);
        return;
      }

      if (isObservable(result)) {
        const obs = destroyRef
          ? result.pipe(takeUntilDestroyed(destroyRef))
          : result;
        currentSub = obs.subscribe({
          next: (rows) => settleSuccess(rows),
          error: (err) => settleError(err),
          complete: () => {
            // Empty completion with no emission: clear loading, resolve latch.
            if (destroyed) return;
            loadingSignal.set(false);
            done();
          },
        });
      } else {
        result.then(
          (rows) => settleSuccess(rows),
          (err) => settleError(err)
        );
      }
    });

    // Only publish the latch if the load is still pending; a synchronous loader
    // has already settled (and nulled inFlight) via done() above.
    if (!settledSync) {
      inFlight = p;
      void p.finally(() => {
        if (inFlight === p) inFlight = null;
      });
    }
    return p;
  }

  function load(): Promise<void> {
    if (inFlight) return inFlight; // single-flight dedup
    if (!isStale()) return Promise.resolve(); // freshness guard
    return runLoad();
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight; // still single-in-flight
    return runLoad();
  }

  function invalidate(): void {
    // Mark stale only — does not fetch (RFC 0002 §7 decision).
    invalidated.set(true);
  }

  // --- offline-first hydration (persist.hydrateThenRevalidate) --------------
  let hydrating: Promise<void> | null = null;
  if (persist && persist.hydrateThenRevalidate) {
    const seed = (raw: string | null): void => {
      if (destroyed || raw == null) return;
      try {
        const rows = JSON.parse(raw) as E[];
        if (Array.isArray(rows)) entity.setAll(rows);
        // Intentionally do NOT set lastLoadedAt — seeded data is stale.
      } catch {
        // Corrupt snapshot: ignore and let the loader repopulate.
      }
    };
    try {
      const got = persist.adapter.getItem(persist.key);
      hydrating =
        got instanceof Promise
          ? got.then(seed, () => undefined)
          : (seed(got), Promise.resolve());
    } catch {
      hydrating = Promise.resolve();
    }
  }

  // --- initial load ---------------------------------------------------------
  if (!lazy) {
    if (hydrating) {
      void hydrating.then(() => {
        if (!destroyed) void load();
      });
    } else {
      void load();
    }
  }

  // Attach loader surface onto the entity signal.
  const target = entity as EntityCollectionSignal<E, K>;
  target.load = load;
  target.refresh = refresh;
  target.invalidate = invalidate;
  Object.defineProperty(target, 'loading', { value: loadingSignal.asReadonly() });
  Object.defineProperty(target, 'loaded', { value: loaded });
  Object.defineProperty(target, 'error', { value: errorSignal.asReadonly() });
  Object.defineProperty(target, 'lastLoadedAt', {
    value: lastLoadedAtSignal.asReadonly(),
  });

  // Brand + tags for invalidateTag()'s tree walk.
  Object.defineProperty(target, ENTITY_COLLECTION_SIGNAL, { value: true });
  Object.defineProperty(target, '__tags', {
    value: tags ? new Set(tags) : null,
  });

  return target;
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
 * `invalidateTag(tree, 'plants')` → subscribed collections mark stale.
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
