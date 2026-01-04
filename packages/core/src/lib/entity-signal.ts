import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { PathNotifier } from '../lib/path-notifier';

/**
 * EntitySignal Implementation
 *
 * Map-based reactive entity collections with:
 * - Full CRUD operations (addOne, updateOne, removeOne, upsertOne)
 * - Query signals (all, count, ids, byId, where, find)
 * - Entity hooks (tap for observation)
 * - Entity interceptors (intercept for blocking/transforming)
 * - Deep signal access (tree.$.users['id'].name())
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
 * Implementation of EntitySignal<E, K>
 * Stores entities in a Map with reactive queries and hooks
 *
 * Uses a Proxy to implement bracket notation access without
 * constraining private properties
 *
 * @internal
 */
export class EntitySignalImpl<
  E extends Record<string, unknown>,
  K extends string | number = string
> {
  // ==================
  // STORAGE
  // ==================

  /** Core storage: entity ID -> entity */
  private storage = new Map<K, E>();

  /** Reactive signals for queries */
  private allSignal: WritableSignal<E[]>;
  private countSignal: WritableSignal<number>;
  private idsSignal: WritableSignal<K[]>;
  private mapSignal: WritableSignal<ReadonlyMap<K, E>>;

  /** Cache for entity nodes (deep access proxies) */
  private nodeCache = new Map<K, EntityNode<E>>();

  // ==================
  // CONFIGURATION
  // ==================

  /** Function to extract key from entity */
  private selectId: (entity: E) => K;

  /** Handlers for observation */
  private tapHandlers: TapHandlers<E, K>[] = [];

  /** Handlers for blocking/transforming */
  private interceptHandlers: InterceptHandlers<E, K>[] = [];

  constructor(
    config: EntityConfig<E, K>,
    private pathNotifier: PathNotifier,
    private basePath: string
  ) {
    // Extract selectId or use default
    this.selectId =
      config.selectId ??
      ((entity: E) => (entity as unknown as Record<string, K>)['id']);

    // Initialize reactive signals
    this.allSignal = signal<E[]>([]);
    this.countSignal = signal<number>(0);
    this.idsSignal = signal<K[]>([]);
    this.mapSignal = signal<ReadonlyMap<K, E>>(new Map());
  }

  // ==================
  // EXPLICIT ACCESS
  // ==================

  byId(id: K): EntityNode<E> | undefined {
    const entity = this.storage.get(id);
    if (!entity) return undefined;
    return this.getOrCreateNode(id, entity);
  }

  byIdOrFail(id: K): EntityNode<E> {
    const node = this.byId(id);
    if (!node) {
      throw new Error(`Entity with id ${String(id)} not found`);
    }
    return node;
  }

  // ==================
  // QUERIES (return Signals)
  // ==================

  get all(): Signal<E[]> {
    return this.allSignal;
  }

  get count(): Signal<number> {
    return this.countSignal;
  }

  get ids(): Signal<K[]> {
    return this.idsSignal;
  }

  get map(): Signal<ReadonlyMap<K, E>> {
    return this.mapSignal;
  }

  has(id: K): Signal<boolean> {
    return computed(() => this.storage.has(id));
  }

  get isEmpty(): Signal<boolean> {
    return computed(() => this.storage.size === 0);
  }

  where(predicate: (entity: E) => boolean): Signal<E[]> {
    return computed(() => {
      const result: E[] = [];
      for (const entity of this.storage.values()) {
        if (predicate(entity)) {
          result.push(entity);
        }
      }
      return result;
    });
  }

  find(predicate: (entity: E) => boolean): Signal<E | undefined> {
    return computed(() => {
      for (const entity of this.storage.values()) {
        if (predicate(entity)) {
          return entity;
        }
      }
      return undefined;
    });
  }

  // ==================
  // MUTATIONS: ADD
  // ==================

  addOne(entity: E, opts?: AddOptions<E, K>): K {
    const id = opts?.selectId?.(entity) ?? this.selectId(entity);

    // Check for duplicates first
    if (this.storage.has(id)) {
      throw new Error(`Entity with id ${String(id)} already exists`);
    }

    // Run interceptors
    let transformedEntity = entity;
    for (const handler of this.interceptHandlers) {
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
    this.storage.set(id, transformedEntity);
    this.nodeCache.delete(id);
    this.updateSignals();

    // Notify PathNotifier
    this.pathNotifier.notify(
      `${this.basePath}.${String(id)}`,
      transformedEntity,
      undefined
    );

    // Run tap handlers
    for (const handler of this.tapHandlers) {
      handler.onAdd?.(transformedEntity, id);
    }

    return id;
  }

  addMany(entities: E[], opts?: AddManyOptions<E, K>): K[] {
    // Check for duplicates first
    const idsToAdd: K[] = [];
    for (const entity of entities) {
      const id = opts?.selectId?.(entity) ?? this.selectId(entity);
      if (this.storage.has(id)) {
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
      for (const handler of this.interceptHandlers) {
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

      this.storage.set(id, transformedEntity);
      this.nodeCache.delete(id);
      addedEntities.push({ id, entity: transformedEntity });
    }

    // Single signal update after all entities are added
    this.updateSignals();

    // Notify PathNotifier for each added entity
    for (const { id, entity } of addedEntities) {
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        entity,
        undefined
      );
    }

    // Run tap handlers for each added entity
    for (const { id, entity } of addedEntities) {
      for (const handler of this.tapHandlers) {
        handler.onAdd?.(entity, id);
      }
    }

    return idsToAdd;
  }

  // ==================
  // MUTATIONS: UPDATE
  // ==================

  updateOne(id: K, changes: Partial<E>): void {
    const entity = this.storage.get(id);
    if (!entity) {
      throw new Error(`Entity with id ${String(id)} not found`);
    }

    const prev = entity;

    // Run interceptors
    let transformedChanges = changes;
    for (const handler of this.interceptHandlers) {
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
    this.storage.set(id, finalUpdated);
    this.nodeCache.delete(id);
    this.updateSignals();

    // Notify PathNotifier
    this.pathNotifier.notify(
      `${this.basePath}.${String(id)}`,
      finalUpdated,
      prev
    );

    // Run tap handlers
    for (const handler of this.tapHandlers) {
      handler.onUpdate?.(id, transformedChanges, finalUpdated);
    }
  }

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
      const entity = this.storage.get(id);
      if (!entity) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }
      const prev = entity;

      // Run interceptors
      let transformedChanges = changes;
      for (const handler of this.interceptHandlers) {
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
      this.storage.set(id, finalUpdated);
      this.nodeCache.delete(id);
      updatedEntities.push({ id, prev, finalUpdated, transformedChanges });
    }

    // Single signal update after all entities are updated
    this.updateSignals();

    // Notify PathNotifier for each updated entity
    for (const { id, prev, finalUpdated } of updatedEntities) {
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        finalUpdated,
        prev
      );
    }

    // Run tap handlers for each updated entity
    for (const { id, transformedChanges, finalUpdated } of updatedEntities) {
      for (const handler of this.tapHandlers) {
        handler.onUpdate?.(id, transformedChanges, finalUpdated);
      }
    }
  }

  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number {
    const idsToUpdate: K[] = [];
    for (const [id, entity] of this.storage) {
      if (predicate(entity)) {
        idsToUpdate.push(id);
      }
    }
    if (idsToUpdate.length > 0) {
      this.updateMany(idsToUpdate, changes);
    }
    return idsToUpdate.length;
  }

  // ==================
  // MUTATIONS: REMOVE
  // ==================

  removeOne(id: K): void {
    const entity = this.storage.get(id);
    if (!entity) {
      throw new Error(`Entity with id ${String(id)} not found`);
    }

    // Run interceptors
    for (const handler of this.interceptHandlers) {
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
    this.storage.delete(id);
    this.nodeCache.delete(id);
    this.updateSignals();

    // Notify PathNotifier
    this.pathNotifier.notify(
      `${this.basePath}.${String(id)}`,
      undefined,
      entity
    );

    // Run tap handlers
    for (const handler of this.tapHandlers) {
      handler.onRemove?.(id, entity);
    }
  }

  removeMany(ids: K[]): void {
    if (ids.length === 0) return;

    // Collect entities and run interceptors first
    const entitiesToRemove: Array<{ id: K; entity: E }> = [];
    for (const id of ids) {
      const entity = this.storage.get(id);
      if (!entity) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }

      // Run interceptors
      for (const handler of this.interceptHandlers) {
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
      this.storage.delete(id);
      this.nodeCache.delete(id);
    }

    // Single signal update after all entities are removed
    this.updateSignals();

    // Notify PathNotifier for each removed entity
    for (const { id, entity } of entitiesToRemove) {
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        undefined,
        entity
      );
    }

    // Run tap handlers for each removed entity
    for (const { id, entity } of entitiesToRemove) {
      for (const handler of this.tapHandlers) {
        handler.onRemove?.(id, entity);
      }
    }
  }

  removeWhere(predicate: (entity: E) => boolean): number {
    const idsToRemove: K[] = [];
    for (const [id, entity] of this.storage) {
      if (predicate(entity)) {
        idsToRemove.push(id);
      }
    }
    if (idsToRemove.length > 0) {
      this.removeMany(idsToRemove);
    }
    return idsToRemove.length;
  }

  // ==================
  // MUTATIONS: UPSERT
  // ==================

  upsertOne(entity: E, opts?: AddOptions<E, K>): K {
    const id = opts?.selectId?.(entity) ?? this.selectId(entity);
    if (this.storage.has(id)) {
      this.updateOne(id, entity);
    } else {
      this.addOne(entity, opts);
    }
    return id;
  }

  upsertMany(entities: E[], opts?: AddOptions<E, K>): K[] {
    if (entities.length === 0) return [];

    // Separate adds from updates
    const toAdd: Array<{ entity: E; id: K }> = [];
    const toUpdate: Array<{ entity: E; id: K; prev: E }> = [];

    for (const entity of entities) {
      const id = opts?.selectId?.(entity) ?? this.selectId(entity);
      if (this.storage.has(id)) {
        toUpdate.push({ entity, id, prev: this.storage.get(id)! });
      } else {
        toAdd.push({ entity, id });
      }
    }

    // Process adds
    const addedEntities: Array<{ id: K; entity: E }> = [];
    for (const { entity, id } of toAdd) {
      // Run interceptors
      let transformedEntity = entity;
      for (const handler of this.interceptHandlers) {
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
      this.storage.set(id, transformedEntity);
      this.nodeCache.delete(id);
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
      for (const handler of this.interceptHandlers) {
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
      this.storage.set(id, finalUpdated);
      this.nodeCache.delete(id);
      updatedEntities.push({ id, prev, finalUpdated, transformedChanges });
    }

    // Single signal update after all entities are processed
    this.updateSignals();

    // Notify PathNotifier for added entities
    for (const { id, entity } of addedEntities) {
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        entity,
        undefined
      );
    }

    // Notify PathNotifier for updated entities
    for (const { id, prev, finalUpdated } of updatedEntities) {
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        finalUpdated,
        prev
      );
    }

    // Run tap handlers for added entities
    for (const { id, entity } of addedEntities) {
      for (const handler of this.tapHandlers) {
        handler.onAdd?.(entity, id);
      }
    }

    // Run tap handlers for updated entities
    for (const { id, transformedChanges, finalUpdated } of updatedEntities) {
      for (const handler of this.tapHandlers) {
        handler.onUpdate?.(id, transformedChanges, finalUpdated);
      }
    }

    return [...toAdd.map((a) => a.id), ...toUpdate.map((u) => u.id)];
  }

  // ==================
  // MUTATIONS: CLEAR/RESET
  // ==================

  clear(): void {
    this.storage.clear();
    this.nodeCache.clear();
    this.updateSignals();
  }

  removeAll(): void {
    this.clear();
  }

  setAll(entities: E[], opts?: AddOptions<E, K>): void {
    // Clear storage without triggering intermediate signal updates
    this.storage.clear();
    this.nodeCache.clear();

    // Add all entities without triggering per-entity signal updates
    const addedIds: K[] = [];
    for (const entity of entities) {
      const id = opts?.selectId?.(entity) ?? this.selectId(entity);

      // Run interceptors
      let transformedEntity = entity;
      for (const handler of this.interceptHandlers) {
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

      this.storage.set(id, transformedEntity);
      addedIds.push(id);
    }

    // Single signal update after all entities are added
    this.updateSignals();

    // Notify PathNotifier for each added entity
    for (let i = 0; i < addedIds.length; i++) {
      const id = addedIds[i];
      const entity = this.storage.get(id);
      this.pathNotifier.notify(
        `${this.basePath}.${String(id)}`,
        entity,
        undefined
      );
    }

    // Run tap handlers for each added entity
    for (let i = 0; i < addedIds.length; i++) {
      const id = addedIds[i];
      const entity = this.storage.get(id)!;
      for (const handler of this.tapHandlers) {
        handler.onAdd?.(entity, id);
      }
    }
  }

  // ==================
  // HOOKS
  // ==================

  tap(handlers: TapHandlers<E, K>): () => void {
    this.tapHandlers.push(handlers);
    return () => {
      const idx = this.tapHandlers.indexOf(handlers);
      if (idx > -1) this.tapHandlers.splice(idx, 1);
    };
  }

  intercept(handlers: InterceptHandlers<E, K>): () => void {
    this.interceptHandlers.push(handlers);
    return () => {
      const idx = this.interceptHandlers.indexOf(handlers);
      if (idx > -1) this.interceptHandlers.splice(idx, 1);
    };
  }

  // ==================
  // INTERNAL HELPERS
  // ==================

  private updateSignals(): void {
    const entities = Array.from(this.storage.values());
    const ids = Array.from(this.storage.keys());
    const map = new Map(this.storage);

    this.allSignal.set(entities);
    this.countSignal.set(entities.length);
    this.idsSignal.set(ids);
    this.mapSignal.set(map);
  }

  private getOrCreateNode(id: K, entity: E): EntityNode<E> {
    let node = this.nodeCache.get(id);
    if (!node) {
      node = this.createEntityNode(id, entity);
      this.nodeCache.set(id, node);
    }
    return node;
  }

  private createEntityNode(id: K, entity: E): EntityNode<E> {
    // Node is callable: node() returns current entity
    const node = (() => this.storage.get(id)) as unknown as EntityNode<E>;

    // Add properties for deep access
    for (const key of Object.keys(entity)) {
      Object.defineProperty(node, key, {
        get: () => {
          const current = this.storage.get(id);
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
}

/**
 * Creates an EntitySignal with Proxy wrapper for bracket notation access
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
  const impl = new EntitySignalImpl(config, pathNotifier, basePath);

  return new Proxy(impl, {
    get: (target: EntitySignalImpl<E, K>, prop: string | symbol) => {
      // Handle string/number bracket access
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return target.byId(Number(prop) as K);
      }
      // Handle normal method/property access
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  }) as EntitySignal<E, K>;
}
