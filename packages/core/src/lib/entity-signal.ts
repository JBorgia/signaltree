import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { PathNotifier } from '../lib/path-notifier';

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

  /** Cache for entity nodes (deep access proxies) */
  const nodeCache = new Map<K, EntityNode<E>>();

  /** Function to extract key from entity */
  const selectId: (entity: E) => K =
    config.selectId ??
    ((entity: E) => (entity as unknown as Record<string, K>)['id']);

  /** Handlers for observation */
  const tapHandlers: TapHandlers<E, K>[] = [];

  /** Handlers for blocking/transforming */
  const interceptHandlers: InterceptHandlers<E, K>[] = [];

  // ==================
  // INTERNAL HELPERS
  // ==================

  function updateSignals(): void {
    const entities = Array.from(storage.values());
    const ids = Array.from(storage.keys());
    const map = new Map(storage);

    allSignal.set(entities);
    countSignal.set(entities.length);
    idsSignal.set(ids);
    mapSignal.set(map);
  }

  function createEntityNode(id: K, entity: E): EntityNode<E> {
    // Node is callable: node() returns current entity
    const node = (() => storage.get(id)) as unknown as EntityNode<E>;

    // Add properties for deep access
    for (const key of Object.keys(entity)) {
      Object.defineProperty(node, key, {
        get: () => {
          const current = storage.get(id);
          const value = current?.[key as keyof E];
          // Return a signal-like callable
          return () => value;
        },
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
  const whereCache: WeakMap<(entity: E) => boolean, Signal<E[]>> = new WeakMap();
  const findCache: WeakMap<(entity: E) => boolean, Signal<E | undefined>> = new WeakMap();

  const api = {
    // ==================
    // EXPLICIT ACCESS
    // ==================

    byId(id: K): EntityNode<E> | undefined {
      const entity = storage.get(id);
      if (!entity) return undefined;
      return getOrCreateNode(id, entity);
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

    get isEmpty(): Signal<boolean> {
      return computed(() => countSignal() === 0);
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
      const id = opts?.selectId?.(entity) ?? selectId(entity);

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
      // Check for duplicates first
      const idsToAdd: K[] = [];
      for (const entity of entities) {
        const id = opts?.selectId?.(entity) ?? selectId(entity);
        if (storage.has(id)) {
          throw new Error(`Entity with id ${String(id)} already exists`);
        }
        idsToAdd.push(id);
      }

      // Add all entities without triggering per-entity signal updates
      const addedEntities: Array<{ id: K; entity: E }> = [];
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const id = idsToAdd[i];

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
        addedEntities.push({ id, entity: transformedEntity });
      }

      // Single signal update after all entities are added
      updateSignals();

      // Notify PathNotifier for each added entity
      for (const { id, entity } of addedEntities) {
        pathNotifier.notify(`${basePath}.${String(id)}`, entity, undefined);
      }

      // Run tap handlers for each added entity
      for (const { id, entity } of addedEntities) {
        for (const handler of tapHandlers) {
          handler.onAdd?.(entity, id);
        }
      }

      return idsToAdd;
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
      const id = opts?.selectId?.(entity) ?? selectId(entity);
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
        const id = opts?.selectId?.(entity) ?? selectId(entity);
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
        const id = opts?.selectId?.(entity) ?? selectId(entity);

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

      // Single signal update after all entities are added
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
