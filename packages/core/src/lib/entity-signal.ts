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
  EntitySignal,
  EntityConfig,
  TapHandlers,
  InterceptHandlers,
  InterceptContext,
  EntityNode,
  AddOptions,
  AddManyOptions,
  MutationOptions,
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
    // Return a Proxy to support bracket notation access
    return new Proxy(this, {
      get: (target, prop: string | symbol) => {
        // Handle string/number bracket access
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          return target.byId(Number(prop) as K);
        }
        // Handle normal method/property access
        return (target as Record<string | symbol, unknown>)[prop];
      },
    }) as any;
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

    // Run interceptors
    const ctx = this.createInterceptContext(entity);
    for (const handler of this.interceptHandlers) {
      handler.onAdd?.(entity, ctx);
    }
    if (ctx.blocked) {
      throw new Error(`Cannot add entity: ${ctx.blockReason}`);
    }

    // Check for duplicates
    if (this.storage.has(id)) {
      throw new Error(`Entity with id ${String(id)} already exists`);
    }

    // Store and update signals
    this.storage.set(id, ctx.value as E);
    this.nodeCache.delete(id); // Invalidate cache
    this.updateSignals();

    // Notify PathNotifier
    this.pathNotifier.notify(
      `${this.basePath}.${String(id)}`,
      ctx.value,
      undefined
    );

    // Run tap handlers
    for (const handler of this.tapHandlers) {
      handler.onAdd?.(ctx.value as E, id);
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

  updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void {
    const entity = this.storage.get(id);
    if (!entity) {
      throw new Error(`Entity with id ${String(id)} not found`);
    }

    const prev = entity;
    const updated = { ...entity, ...changes };

    // Run interceptors
    const ctx = this.createInterceptContext(updated);
    for (const handler of this.interceptHandlers) {
      handler.onUpdate?.(id, changes, ctx);
    }
    if (ctx.blocked) {
      throw new Error(`Cannot update entity: ${ctx.blockReason}`);
    }

    // Store and update signals
    this.storage.set(id, ctx.value as E);
    this.nodeCache.delete(id); // Invalidate cache
    this.updateSignals();

    // Notify PathNotifier
    this.pathNotifier.notify(`${this.basePath}.${String(id)}`, ctx.value, prev);

    // Run tap handlers
    for (const handler of this.tapHandlers) {
      handler.onUpdate?.(id, changes, ctx.value as E);
    }
  }

  updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void {
    for (const id of ids) {
      this.updateOne(id, changes, opts);
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

  removeOne(id: K, opts?: MutationOptions): void {
    const entity = this.storage.get(id);
    if (!entity) {
      throw new Error(`Entity with id ${String(id)} not found`);
    }

    // Run interceptors
    const ctx = this.createInterceptContext(entity);
    for (const handler of this.interceptHandlers) {
      handler.onRemove?.(id, entity, ctx);
    }
    if (ctx.blocked) {
      throw new Error(`Cannot remove entity: ${ctx.blockReason}`);
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

  removeMany(ids: K[], opts?: MutationOptions): void {
    for (const id of ids) {
      this.removeOne(id, opts);
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

  private createInterceptContext(value: E): InterceptContext<E> {
    const ctx: InterceptContext<E> = {
      blocked: false,
      blockReason: '',
      value,
      block: (reason: string) => {
        ctx.blocked = true;
        ctx.blockReason = reason;
      },
      transform: (transformed: E) => {
        ctx.value = transformed;
      },
    };
    return ctx;
  }

  private getOrCreateNode(id: K, entity: E): EntityNode<E> {
    if (!this.nodeCache.has(id)) {
      this.nodeCache.set(id, this.createEntityNode(id, entity));
    }
    return this.nodeCache.get(id)!;
  }

  private createEntityNode(id: K, entity: E): EntityNode<E> {
    // Node is callable: node() returns current entity
    const node = (() => this.storage.get(id)) as unknown as EntityNode<E>;

    // Add properties for deep access
    const nodeObj = node as Record<string | symbol, unknown>;
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
 * Factory function to create an entity collection marker
 *
 * Usage:
 * ```typescript
 * const tree = signalTree({
 *   users: entityMap<User>(),
 * }).with(withEntities());
 * ```
 *
 * @param config Optional configuration (selectId, initial, selectKey)
 * @returns A type marker that withEntities() will recognize
 */
export function entityMap<
  E extends Record<string, unknown>,
  K extends string | number = string
>(config?: Partial<EntityConfig<E, K>>): unknown {
  // Return a marker object that withEntities() recognizes
  return {
    __isEntityMap: true,
    __entityMapConfig: config || {},
  };
}
