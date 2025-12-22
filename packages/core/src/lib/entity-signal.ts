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

  all(): Signal<E[]> {
    return this.allSignal;
  }

  count(): Signal<number> {
    return this.countSignal;
  }

  ids(): Signal<K[]> {
    return this.idsSignal;
  }

  map(): Signal<ReadonlyMap<K, E>> {
    return this.mapSignal;
  }

  has(id: K): Signal<boolean> {
    return computed(() => this.storage.has(id));
  }

  isEmpty(): Signal<boolean> {
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
    const ids: K[] = [];
    for (const entity of entities) {
      ids.push(this.addOne(entity, opts));
    }
    return ids;
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
    for (const id of ids) {
      this.updateOne(id, changes);
    }
  }

  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number {
    let count = 0;
    for (const [id, entity] of this.storage) {
      if (predicate(entity)) {
        this.updateOne(id, changes);
        count++;
      }
    }
    return count;
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
    for (const id of ids) {
      this.removeOne(id);
    }
  }

  removeWhere(predicate: (entity: E) => boolean): number {
    const idsToRemove: K[] = [];
    for (const [id, entity] of this.storage) {
      if (predicate(entity)) {
        idsToRemove.push(id);
      }
    }
    let count = 0;
    for (const id of idsToRemove) {
      this.removeOne(id);
      count++;
    }
    return count;
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
    return entities.map((e) => this.upsertOne(e, opts));
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
    this.clear();
    this.addMany(entities, opts);
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
