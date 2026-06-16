import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { PathNotifier } from '../lib/path-notifier';

// Angular's global dev-mode flag (defined by the Angular CLI; undefined in
// plain test/node contexts, treated as dev there).
declare const ngDevMode: boolean | undefined;

/**
 * EntitySignal Implementation (Composition Pattern)
 *
 * Map-based reactive entity collections with:
 * - Full CRUD operations (addOne, updateOne, removeOne, upsertOne)
 * - Query signals (all, count, ids, byId, where, find)
 * - Entity hooks (tap for observation)
 * - Entity interceptors (intercept for blocking/transforming)
 * - Deep signal access (tree.$.users['id'].name())
 *
 * Uses composition (closures) instead of classes to avoid
 * Proxy + class `this` binding issues.
 *
 * @internal
 */

import type {
  EntityConfig,
  EntitySignal,
  TapHandlers,
  InterceptHandlers,
  InterceptContext,
  EntityNode,
  AddOptions,
  AddManyOptions,
} from '../lib/types';

/**
 * Creates an EntitySignal using composition pattern.
 * All state is stored in closures - no `this` binding issues possible.
 *
 * @internal
 */
export function createEntitySignal<
  E extends Record<string, unknown>,
  K extends string | number = string
>(
  config: EntityConfig<E, K>,
  pathNotifier: PathNotifier,
  basePath: string
): EntitySignal<E, K> {
  // ==================
  // CLOSURE STATE (no `this` needed)
  // ==================

  /** Core storage: entity ID -> entity */
  const storage = new Map<K, E>();

  /** Reactive signals for queries */
  const allSignal: WritableSignal<E[]> = signal<E[]>([]);
  const countSignal: WritableSignal<number> = signal<number>(0);
  const idsSignal: WritableSignal<K[]> = signal<K[]>([]);
  const mapSignal: WritableSignal<ReadonlyMap<K, E>> = signal<
    ReadonlyMap<K, E>
  >(new Map());

  /**
   * Per-entity signals — the body-granular reactivity layer.
   *
   * Each entity that is read via `byId()`/node access gets its own
   * `WritableSignal<E | undefined>`. Per-entity field reads and `node()`
   * depend ONLY on this signal, not on the whole-collection `mapSignal`, so
   * updating one entity dirties only that entity's readers (fan-out 1) instead
   * of every entity's computeds (fan-out N). Collection queries (`all`, `map`,
   * `count`, `ids`, `where`, `find`, computed slices) still depend on the
   * collection signals and recompute on any change — which is correct.
   *
   * Materialized lazily (on first `byId`/node access) and kept O(1) per
   * mutation by only syncing the entities that actually changed.
   */
  const entitySignals = new Map<K, WritableSignal<E | undefined>>();

  /** Get (or lazily create) the per-entity signal, seeded from storage. */
  function getEntitySignal(id: K): WritableSignal<E | undefined> {
    let s = entitySignals.get(id);
    if (!s) {
      s = signal<E | undefined>(storage.get(id));
      entitySignals.set(id, s);
    }
    return s;
  }

  /**
   * Sync one entity's signal from storage after a mutation. No-op if the
   * entity was never materialized (nothing is observing it yet), keeping
   * single-entity writes O(1) regardless of collection size.
   */
  function syncEntitySignal(id: K): void {
    const s = entitySignals.get(id);
    if (s) s.set(storage.get(id));
  }

  /**
   * Release one entity's signal on removal: notify current observers that the
   * entity is gone (set undefined), then drop it from the map so churning
   * collections don't accumulate one signal per id ever removed. Held field
   * references stay valid (read undefined); a later byId() after re-add gets a
   * fresh signal.
   */
  function removeEntitySignal(id: K): void {
    const s = entitySignals.get(id);
    if (s) {
      s.set(undefined);
      entitySignals.delete(id);
    }
  }

  /**
   * Full reset (clear/setAll): notify all current observers their entity is
   * gone, then drop every materialized signal so memory returns to baseline.
   * setAll re-materializes lazily on the next byId() of each surviving entity.
   */
  function resetEntitySignals(): void {
    entitySignals.forEach((s) => s.set(undefined));
    entitySignals.clear();
  }

  /** Cache for entity nodes (deep access proxies) */
  const nodeCache = new Map<K, EntityNode<E>>();

  /**
   * Cached `empty` / `isEmpty` computed — shared between the v10.3 canonical
   * `.empty` and the deprecated `.isEmpty` alias so first-access creates one
   * computed and both names point at the same Signal instance.
   */
  let cachedEmpty: Signal<boolean> | null = null;

  /** Function to extract key from entity */
  const selectId: (entity: E) => K =
    config.selectId ??
    ((entity: E) => (entity as unknown as Record<string, K>)['id']);

  // Dev-mode guard state: warn once if entities resolve to a null/undefined id.
  let warnedMissingId = false;

  /**
   * Resolve an entity's id (per-call selectId override → config selectId →
   * default `.id`). Dev-mode guardrail: a null/undefined id means the entity
   * has no `id` field and no `selectId` was provided, so every such entity
   * collides under one key — a common mistake (especially in AI-generated
   * code). Warn once with an actionable fix.
   */
  function deriveId(entity: E, opts?: { selectId?: (e: E) => K }): K {
    const id = opts?.selectId?.(entity) ?? selectId(entity);
    if (
      id == null &&
      (typeof ngDevMode === 'undefined' || ngDevMode) &&
      !warnedMissingId
    ) {
      warnedMissingId = true;
      console.warn(
        `SignalTree entityMap${basePath ? ` at "${basePath}"` : ''}: an entity ` +
          `resolved to id=${String(id)}. Entities need a stable key — give them ` +
          `an \`id\` field or pass entityMap({ selectId: (e) => e.yourKey }). ` +
          `Without it, entities collide under a single key.`
      );
    }
    return id;
  }

  /** Handlers for observation */
  const tapHandlers: TapHandlers<E, K>[] = [];

  /** Handlers for blocking/transforming */
  const interceptHandlers: InterceptHandlers<E, K>[] = [];

  // ==================
  // INTERNAL HELPERS
  // ==================

  function updateSignals(): void {
    const entities = Array.from(storage.values());
    const map = new Map(storage);

    // Apply optional sortComparer so `all`/`ids` expose a stable sorted order
    // (parity with @ngrx/entity). `map` keeps insertion order.
    if (config.sortComparer) {
      entities.sort(config.sortComparer);
      allSignal.set(entities);
      idsSignal.set(entities.map((e) => selectId(e)));
    } else {
      allSignal.set(entities);
      idsSignal.set(Array.from(storage.keys()));
    }
    countSignal.set(entities.length);
    mapSignal.set(map);
  }

  function createEntityNode(id: K, entity: E): EntityNode<E> {
    // Entity-level callable:
    //   node()           → reads current entity (reactive via mapSignal)
    //   node(value)      → full entity replace via updateOne (throws if entity removed)
    //   node(updater)    → updater-based replace via updateOne (throws if entity removed)
    // Ensure the per-entity signal exists so field computeds below subscribe
    // to it (granular) rather than to the whole-collection mapSignal.
    const entitySig = getEntitySignal(id);

    const node = ((valueOrUpdater?: E | ((current: E) => E)): E | undefined => {
      if (valueOrUpdater === undefined) {
        return entitySig();
      }
      const current = storage.get(id);
      if (current === undefined) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }
      if (typeof valueOrUpdater === 'function') {
        api.updateOne(id, (valueOrUpdater as (c: E) => E)(current) as Partial<E>);
      } else {
        api.updateOne(id, valueOrUpdater as Partial<E>);
      }
      return undefined;
    }) as unknown as EntityNode<E>;

    // Field properties: Option B+ computed-based shim.
    // Each field returns a computed(() => field_value) with .set()/.update()/.asReadonly()
    // attached so that isSignal() returns true and toObservable() works.
    // Writes delegate to api.updateOne which runs interceptors and tap handlers.
    for (const key of Object.keys(entity)) {
      const fieldKey = key as keyof E;
      const fieldSignal = computed(() => entitySig()?.[fieldKey]);

      Object.assign(fieldSignal, {
        set: (value: E[typeof fieldKey]) => {
          api.updateOne(id, { [fieldKey]: value } as Partial<E>);
        },
        update: (fn: (current: E[typeof fieldKey] | undefined) => E[typeof fieldKey]) => {
          api.updateOne(id, {
            [fieldKey]: fn(entitySig()?.[fieldKey]),
          } as Partial<E>);
        },
        asReadonly: () => fieldSignal,
      });

      Object.defineProperty(node, key, {
        get: () => fieldSignal,
        enumerable: true,
        configurable: true,
      });
    }

    return node;
  }

  function getOrCreateNode(id: K, entity: E): EntityNode<E> {
    let node = nodeCache.get(id);
    if (!node) {
      node = createEntityNode(id, entity);
      nodeCache.set(id, node);
    }
    return node;
  }

  // ==================
  // API OBJECT
  // ==================

  // Caches for predicate-based queries. Uses WeakMap keyed by function
  // reference so callers that pass the same function object will receive the
  // same computed Signal instance (reduces redundant computed creation).
  // NOTE: This only works reliably when callers pass stable, named
  // predicate references. Inline anonymous predicates will not be cached.
  const whereCache: WeakMap<
    (entity: E) => boolean,
    Signal<E[]>
  > = new WeakMap();
  const findCache: WeakMap<
    (entity: E) => boolean,
    Signal<E | undefined>
  > = new WeakMap();

  const api = {
    // ==================
    // EXPLICIT ACCESS
    // ==================

    byId(id: K): EntityNode<E> | undefined {
      if (storage.has(id)) {
        // Present: subscribe to the PER-ENTITY signal only, so callers re-run
        // when THIS entity changes but not when others do (body-granular).
        // Materialized lazily here — bounded by the number of live entities.
        const entity = getEntitySignal(id)();
        return entity ? getOrCreateNode(id, entity) : undefined;
      }
      // Absent: subscribe to the shared ids signal for "appears later"
      // reactivity WITHOUT materializing a permanent per-entity signal for an
      // id that may never exist (which would leak one signal per probed id).
      idsSignal();
      return undefined;
    },

    byIdOrFail(id: K): EntityNode<E> {
      const node = api.byId(id);
      if (!node) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }
      return node;
    },

    // ==================
    // QUERIES (return Signals)
    // ==================

    get all(): Signal<E[]> {
      return allSignal;
    },

    get count(): Signal<number> {
      return countSignal;
    },

    get ids(): Signal<K[]> {
      return idsSignal;
    },

    get map(): Signal<ReadonlyMap<K, E>> {
      return mapSignal;
    },

    has(id: K): Signal<boolean> {
      return computed(() => mapSignal().has(id));
    },

    // v10.3 canonical (bare) — preferred. Cached so `.empty` and `.isEmpty`
    // share the same computed instance.
    get empty(): Signal<boolean> {
      return (cachedEmpty ??= computed(() => countSignal() === 0));
    },
    /** @deprecated v10.3 — use `.empty`. Removed in v11. */
    get isEmpty(): Signal<boolean> {
      return (cachedEmpty ??= computed(() => countSignal() === 0));
    },

    where(predicate: (entity: E) => boolean): Signal<E[]> {
      const cached = whereCache.get(predicate);
      if (cached) return cached;

      const s = computed(() => allSignal().filter(predicate));
      whereCache.set(predicate, s);
      return s;
    },

    find(predicate: (entity: E) => boolean): Signal<E | undefined> {
      const cached = findCache.get(predicate);
      if (cached) return cached;

      const s = computed(() => allSignal().find(predicate));
      findCache.set(predicate, s);
      return s;
    },

    // ==================
    // MUTATIONS: ADD
    // ==================

    addOne(entity: E, opts?: AddOptions<E, K>): K {
      const id = deriveId(entity, opts);

      // Check for duplicates first
      if (storage.has(id)) {
        throw new Error(`Entity with id ${String(id)} already exists`);
      }

      // Run interceptors
      let transformedEntity = entity;
      for (const handler of interceptHandlers) {
        const ctx: InterceptContext<E> = {
          block: (reason?: string) => {
            throw new Error(
              `Cannot add entity: ${reason || 'blocked by interceptor'}`
            );
          },
          transform: (value: E) => {
            transformedEntity = value;
          },
          blocked: false,
          blockReason: undefined,
        };
        handler.onAdd?.(entity, ctx);
      }

      // Store and update signals
      storage.set(id, transformedEntity);
      nodeCache.delete(id);
      syncEntitySignal(id);
      updateSignals();

      // Notify PathNotifier
      pathNotifier.notify(
        `${basePath}.${String(id)}`,
        transformedEntity,
        undefined
      );

      // Run tap handlers
      for (const handler of tapHandlers) {
        handler.onAdd?.(transformedEntity, id);
      }

      return id;
    },

    addMany(entities: E[], opts?: AddManyOptions<E, K>): K[] {
      const mode = opts?.mode ?? 'strict';

      // First pass: validate/filter based on mode
      const toProcess: Array<{ entity: E; id: K }> = [];
      for (const entity of entities) {
        const id = deriveId(entity, opts);
        if (storage.has(id)) {
          if (mode === 'strict') {
            throw new Error(`Entity with id ${String(id)} already exists`);
          } else if (mode === 'skip') {
            continue;
          }
          // 'overwrite': fall through — storage.set below replaces the existing entry
        }
        toProcess.push({ entity, id });
      }

      if (toProcess.length === 0) return [];

      // Process all entities without triggering per-entity signal updates
      const processedIds: K[] = [];
      const addedEntities: Array<{ id: K; entity: E }> = [];

      for (const { entity, id } of toProcess) {
        // Run interceptors
        let transformedEntity = entity;
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<E> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot add entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: (value: E) => {
              transformedEntity = value;
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onAdd?.(entity, ctx);
        }

        storage.set(id, transformedEntity);
        nodeCache.delete(id);
        syncEntitySignal(id);
        processedIds.push(id);
        addedEntities.push({ id, entity: transformedEntity });
      }

      // Single signal update after all entities are processed
      updateSignals();

      // Notify PathNotifier for each processed entity
      for (const { id, entity } of addedEntities) {
        pathNotifier.notify(`${basePath}.${String(id)}`, entity, undefined);
      }

      // Run tap handlers for each processed entity
      for (const { id, entity } of addedEntities) {
        for (const handler of tapHandlers) {
          handler.onAdd?.(entity, id);
        }
      }

      return processedIds;
    },

    // ==================
    // MUTATIONS: UPDATE
    // ==================

    updateOne(id: K, changes: Partial<E>): void {
      const entity = storage.get(id);
      if (!entity) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }

      const prev = entity;

      // Run interceptors
      let transformedChanges = changes;
      for (const handler of interceptHandlers) {
        const ctx: InterceptContext<Partial<E>> = {
          block: (reason?: string) => {
            throw new Error(
              `Cannot update entity: ${reason || 'blocked by interceptor'}`
            );
          },
          transform: (value: Partial<E>) => {
            transformedChanges = value;
          },
          blocked: false,
          blockReason: undefined,
        };
        handler.onUpdate?.(id, changes, ctx);
      }

      const finalUpdated = { ...entity, ...transformedChanges };
      storage.set(id, finalUpdated);
      nodeCache.delete(id);
      syncEntitySignal(id);
      updateSignals();

      // Notify PathNotifier
      pathNotifier.notify(`${basePath}.${String(id)}`, finalUpdated, prev);

      // Run tap handlers
      for (const handler of tapHandlers) {
        handler.onUpdate?.(id, transformedChanges, finalUpdated);
      }
    },

    updateMany(ids: K[], changes: Partial<E>): void {
      if (ids.length === 0) return;

      // Collect entities and run interceptors first
      const updatedEntities: Array<{
        id: K;
        prev: E;
        finalUpdated: E;
        transformedChanges: Partial<E>;
      }> = [];

      for (const id of ids) {
        const entity = storage.get(id);
        if (!entity) {
          throw new Error(`Entity with id ${String(id)} not found`);
        }
        const prev = entity;

        // Run interceptors
        let transformedChanges = changes;
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<Partial<E>> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot update entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: (value: Partial<E>) => {
              transformedChanges = value;
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onUpdate?.(id, changes, ctx);
        }

        const finalUpdated = { ...entity, ...transformedChanges };
        storage.set(id, finalUpdated);
        nodeCache.delete(id);
        syncEntitySignal(id);
        updatedEntities.push({ id, prev, finalUpdated, transformedChanges });
      }

      // Single signal update after all entities are updated
      updateSignals();

      // Notify PathNotifier for each updated entity
      for (const { id, prev, finalUpdated } of updatedEntities) {
        pathNotifier.notify(`${basePath}.${String(id)}`, finalUpdated, prev);
      }

      // Run tap handlers for each updated entity
      for (const { id, transformedChanges, finalUpdated } of updatedEntities) {
        for (const handler of tapHandlers) {
          handler.onUpdate?.(id, transformedChanges, finalUpdated);
        }
      }
    },

    updateWhere(
      predicate: (entity: E) => boolean,
      changes: Partial<E>
    ): number {
      const idsToUpdate: K[] = [];
      for (const [id, entity] of storage) {
        if (predicate(entity)) {
          idsToUpdate.push(id);
        }
      }
      if (idsToUpdate.length > 0) {
        api.updateMany(idsToUpdate, changes);
      }
      return idsToUpdate.length;
    },

    // ==================
    // MUTATIONS: REMOVE
    // ==================

    removeOne(id: K): void {
      const entity = storage.get(id);
      if (!entity) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }

      // Run interceptors
      for (const handler of interceptHandlers) {
        const ctx: InterceptContext<void> = {
          block: (reason?: string) => {
            throw new Error(
              `Cannot remove entity: ${reason || 'blocked by interceptor'}`
            );
          },
          transform: () => {
            // void transform - no transformation possible
          },
          blocked: false,
          blockReason: undefined,
        };
        handler.onRemove?.(id, entity, ctx);
      }

      // Delete and update signals
      storage.delete(id);
      nodeCache.delete(id);
      removeEntitySignal(id);
      updateSignals();

      // Notify PathNotifier
      pathNotifier.notify(`${basePath}.${String(id)}`, undefined, entity);

      // Run tap handlers
      for (const handler of tapHandlers) {
        handler.onRemove?.(id, entity);
      }
    },

    removeMany(ids: K[]): void {
      if (ids.length === 0) return;

      // Collect entities and run interceptors first
      const entitiesToRemove: Array<{ id: K; entity: E }> = [];
      for (const id of ids) {
        const entity = storage.get(id);
        if (!entity) {
          throw new Error(`Entity with id ${String(id)} not found`);
        }

        // Run interceptors
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<void> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot remove entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: () => {
              // void transform - no transformation possible
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onRemove?.(id, entity, ctx);
        }

        entitiesToRemove.push({ id, entity });
      }

      // Delete all entities without triggering per-entity signal updates
      for (const { id } of entitiesToRemove) {
        storage.delete(id);
        nodeCache.delete(id);
        removeEntitySignal(id);
      }

      // Single signal update after all entities are removed
      updateSignals();

      // Notify PathNotifier for each removed entity
      for (const { id, entity } of entitiesToRemove) {
        pathNotifier.notify(`${basePath}.${String(id)}`, undefined, entity);
      }

      // Run tap handlers for each removed entity
      for (const { id, entity } of entitiesToRemove) {
        for (const handler of tapHandlers) {
          handler.onRemove?.(id, entity);
        }
      }
    },

    removeWhere(predicate: (entity: E) => boolean): number {
      const idsToRemove: K[] = [];
      for (const [id, entity] of storage) {
        if (predicate(entity)) {
          idsToRemove.push(id);
        }
      }
      if (idsToRemove.length > 0) {
        api.removeMany(idsToRemove);
      }
      return idsToRemove.length;
    },

    // ==================
    // MUTATIONS: UPSERT
    // ==================

    upsertOne(entity: E, opts?: AddOptions<E, K>): K {
      const id = deriveId(entity, opts);
      if (storage.has(id)) {
        api.updateOne(id, entity);
      } else {
        api.addOne(entity, opts);
      }
      return id;
    },

    upsertMany(entities: E[], opts?: AddOptions<E, K>): K[] {
      if (entities.length === 0) return [];

      // Separate adds from updates
      const toAdd: Array<{ entity: E; id: K }> = [];
      const toUpdate: Array<{ entity: E; id: K; prev: E }> = [];

      for (const entity of entities) {
        const id = deriveId(entity, opts);
        const existing = storage.get(id);
        if (existing !== undefined) {
          toUpdate.push({ entity, id, prev: existing });
        } else {
          toAdd.push({ entity, id });
        }
      }

      // Process adds
      const addedEntities: Array<{ id: K; entity: E }> = [];
      for (const { entity, id } of toAdd) {
        // Run interceptors
        let transformedEntity = entity;
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<E> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot add entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: (value: E) => {
              transformedEntity = value;
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onAdd?.(entity, ctx);
        }
        storage.set(id, transformedEntity);
        nodeCache.delete(id);
        syncEntitySignal(id);
        addedEntities.push({ id, entity: transformedEntity });
      }

      // Process updates
      const updatedEntities: Array<{
        id: K;
        prev: E;
        finalUpdated: E;
        transformedChanges: Partial<E>;
      }> = [];
      for (const { entity, id, prev } of toUpdate) {
        // Run interceptors
        let transformedChanges: Partial<E> = entity;
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<Partial<E>> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot update entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: (value: Partial<E>) => {
              transformedChanges = value;
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onUpdate?.(id, entity, ctx);
        }
        const finalUpdated = { ...prev, ...transformedChanges };
        storage.set(id, finalUpdated);
        nodeCache.delete(id);
        syncEntitySignal(id);
        updatedEntities.push({ id, prev, finalUpdated, transformedChanges });
      }

      // Single signal update after all entities are processed
      updateSignals();

      // Notify PathNotifier for added entities
      for (const { id, entity } of addedEntities) {
        pathNotifier.notify(`${basePath}.${String(id)}`, entity, undefined);
      }

      // Notify PathNotifier for updated entities
      for (const { id, prev, finalUpdated } of updatedEntities) {
        pathNotifier.notify(`${basePath}.${String(id)}`, finalUpdated, prev);
      }

      // Run tap handlers for added entities
      for (const { id, entity } of addedEntities) {
        for (const handler of tapHandlers) {
          handler.onAdd?.(entity, id);
        }
      }

      // Run tap handlers for updated entities
      for (const { id, transformedChanges, finalUpdated } of updatedEntities) {
        for (const handler of tapHandlers) {
          handler.onUpdate?.(id, transformedChanges, finalUpdated);
        }
      }

      return [...toAdd.map((a) => a.id), ...toUpdate.map((u) => u.id)];
    },

    // ==================
    // MUTATIONS: CLEAR/RESET
    // ==================

    clear(): void {
      storage.clear();
      nodeCache.clear();
      resetEntitySignals();
      updateSignals();
    },

    removeAll(): void {
      api.clear();
    },

    setAll(entities: E[], opts?: AddOptions<E, K>): void {
      // Clear storage without triggering intermediate signal updates
      storage.clear();
      nodeCache.clear();

      // Add all entities without triggering per-entity signal updates
      const addedIds: K[] = [];
      for (const entity of entities) {
        const id = deriveId(entity, opts);

        // Run interceptors
        let transformedEntity = entity;
        for (const handler of interceptHandlers) {
          const ctx: InterceptContext<E> = {
            block: (reason?: string) => {
              throw new Error(
                `Cannot add entity: ${reason || 'blocked by interceptor'}`
              );
            },
            transform: (value: E) => {
              transformedEntity = value;
            },
            blocked: false,
            blockReason: undefined,
          };
          handler.onAdd?.(entity, ctx);
        }

        storage.set(id, transformedEntity);
        addedIds.push(id);
      }

      // Single signal update after all entities are added. setAll is a full
      // replace: release every materialized per-entity signal (surviving
      // entities re-materialize lazily on next byId) so memory returns to
      // baseline instead of retaining one signal per id ever seen.
      resetEntitySignals();
      updateSignals();

      // Notify PathNotifier for each added entity
      for (let i = 0; i < addedIds.length; i++) {
        const id = addedIds[i];
        const entity = storage.get(id);
        pathNotifier.notify(`${basePath}.${String(id)}`, entity, undefined);
      }

      // Run tap handlers for each added entity
      for (let i = 0; i < addedIds.length; i++) {
        const id = addedIds[i];
        const entity = storage.get(id);
        if (entity) {
          for (const handler of tapHandlers) {
            handler.onAdd?.(entity, id);
          }
        }
      }
    },

    // ==================
    // HOOKS
    // ==================

    tap(handlers: TapHandlers<E, K>): () => void {
      tapHandlers.push(handlers);
      return () => {
        const idx = tapHandlers.indexOf(handlers);
        if (idx > -1) tapHandlers.splice(idx, 1);
      };
    },

    intercept(handlers: InterceptHandlers<E, K>): () => void {
      interceptHandlers.push(handlers);
      return () => {
        const idx = interceptHandlers.indexOf(handlers);
        if (idx > -1) interceptHandlers.splice(idx, 1);
      };
    },
  };

  // ==================
  // PROXY FOR BRACKET NOTATION
  // ==================

  // The Proxy only handles bracket notation access (signal[id])
  // All methods are direct properties on api - no binding needed
  return new Proxy(api as unknown as EntitySignal<E, K>, {
    get: (target: EntitySignal<E, K>, prop: string | symbol) => {
      // Handle string/number bracket access: signal[123] or signal['abc']
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return api.byId(Number(prop) as K);
      }
      // All other access goes directly to api
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}
