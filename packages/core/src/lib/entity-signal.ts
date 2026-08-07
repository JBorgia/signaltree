import { computed, Signal, signal, WritableSignal } from '@angular/core';

import { PathNotifier } from '../lib/path-notifier';

// Angular's global dev-mode flag (defined by the Angular CLI; undefined in
// plain test/node contexts, treated as dev there).
declare const ngDevMode: boolean | undefined;

/**
 * Wrong entityMap method names AI agents and devs reach for (from other state
 * libraries), mapped to the SignalTree equivalent. Used by a dev-mode proxy
 * guardrail to turn a cryptic "undefined is not a function" into an actionable
 * hint. Sourced from the documented cross-library hallucination table.
 */
const WRONG_ENTITY_METHODS: Record<string, string> = {
  upsert: 'upsertOne(entity) / upsertMany(entities)',
  add: 'addOne(entity) / addMany(entities)',
  insert: 'addOne(entity)',
  update: 'updateOne(id, changes) / updateMany(ids, changes)',
  remove: 'removeOne(id) / removeMany(ids)',
  delete: 'removeOne(id)',
  getAll: 'all() (a signal)',
  selectAll: 'all() (a signal)',
  selectMany: 'where(predicate)',
  selectEntity: 'byId(id)',
  addEntities: 'addMany(entities)',
  setEntities: 'setAll(entities)',
  setProps: 'set leaves directly — entityMap has no props (Elf pattern)',
  next: 'set leaves directly — not an RxJS Subject',
  asObservable: 'use the signal directly — not an RxJS Subject',
};

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

  /**
   * Collection version. Bumped once per mutation; every collection query below
   * derives from it LAZILY.
   *
   * This replaced eager rebuilding, which made a single-entity update O(size).
   * `updateSignals()` used to run on EVERY mutation and do three full copies of
   * the collection — `Array.from(storage.values())`, `Array.from(storage.keys())`
   * and `new Map(storage)` — plus a `.set()` on each derived signal, which then
   * deep-compared them. Measured on a 50,000-row collection: 2.8ms PER
   * `updateOne`, scaling cleanly with size (38us @1k, 510us @10k). That defeats
   * the entire point of a Map-backed entity store, whose storage write is O(1).
   *
   * (It was not the deep equality: shallow comparison measured the same. It was
   * the copying.)
   *
   * Now the copies happen only when a query is actually READ, and Angular's
   * computed caches them until the next mutation — so a grid that reads `all()`
   * once per frame pays once per frame instead of once per write.
   */
  const version = signal(0);

  /** Reactive signals for queries — all derived, none eagerly maintained. */
  const allSignal: Signal<E[]> = computed(() => {
    version();
    const entities = Array.from(storage.values());
    // `sortComparer` gives `all`/`ids` a stable sorted order (parity with
    // @ngrx/entity); `map` keeps insertion order.
    if (config.sortComparer) entities.sort(config.sortComparer);
    return entities;
  });
  const countSignal: Signal<number> = computed(() => {
    version();
    // O(1) — this used to be `entities.length` on a freshly built array.
    return storage.size;
  });
  const idsSignal: Signal<K[]> = computed(() => {
    version();
    return config.sortComparer
      ? allSignal().map((e) => selectId(e))
      : Array.from(storage.keys());
  });
  const mapSignal: Signal<ReadonlyMap<K, E>> = computed(() => {
    version();
    // Still a copy: callers may hold the result across mutations and must not
    // see it change underneath them. But it is paid on read, not on write.
    return new Map(storage);
  });

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

  /** Active-entity selection. See the `activeId`/`activeEntity` accessors. */
  const activeIdSignal = signal<K | undefined>(undefined);
  let cachedActiveEntity: Signal<E | undefined> | undefined;

  /**
   * Re-orders `storage` so the given ids come first, in the order given.
   *
   * Only the map's iteration order changes; no per-entity signal is touched, so
   * prepending does not invalidate any row's consumers. The derived collection
   * signals pick the new order up from the version bump.
   */
  function moveToFront(ids: K[]): void {
    const moving = new Set(ids);
    const rest = Array.from(storage.entries()).filter(([k]) => !moving.has(k));
    const front = ids
      .map((id) => [id, storage.get(id)] as const)
      .filter(([, v]) => v !== undefined);
    storage.clear();
    for (const [k, v] of front) storage.set(k, v as E);
    for (const [k, v] of rest) storage.set(k, v);
    updateSignals();
  }

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

  /**
   * Cache for entity nodes (deep access proxies), held WEAKLY.
   *
   * `byId()` materialises a per-entity node so that row can be bound and
   * written independently — the whole point of granular reactivity. It used to
   * be a strong `Map`, which meant READING permanently allocated: entries were
   * removed on mutation or removal, but nothing bounded growth from reads.
   *
   * Measured at 10,000 entities: 315 B/entity for the collection, and
   * **4,149 B/entity once `byId()` has been called on every row** — 3.0 MB
   * against 39.6 MB, 46x the data. That is the documented pattern for granular
   * updates, so the recommended usage was the expensive one, and on a low-end
   * device it is the shape that runs a list out of memory.
   *
   * A node should live exactly as long as someone holds it. A `WeakRef` gives
   * that: a node no component retains becomes collectable, and a node nobody
   * holds cannot observe its own identity changing, so the next `byId()` simply
   * builds a fresh one. The `FinalizationRegistry` sweeps the dead map entry so
   * the Map itself does not grow with empty refs.
   *
   * ⚠️ A HELD reference must still survive churn — see
   * entity-granular-reactivity.spec.ts, which pins that a node held across
   * remove -> re-add keeps working. Weakness must not weaken THAT: while a
   * caller holds the node, the WeakRef cannot be cleared, so the existing
   * behaviour is unchanged for every reference anyone can actually observe.
   */
  const nodeCache = new Map<K, WeakRef<EntityNode<E>>>();
  const nodeFinalizer =
    typeof FinalizationRegistry === 'function'
      ? new FinalizationRegistry<K>((id) => {
          // Only drop the slot if it is still the dead ref — a later byId()
          // may already have installed a live replacement.
          if (nodeCache.get(id)?.deref() === undefined) nodeCache.delete(id);
        })
      : null;

  /** Cached `empty` computed — created on first access. */
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
          `Without it, entities collide under a single key. [ST2001]`
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

  /** Mark the collection dirty. O(1) — see the `version` docs above. */
  function updateSignals(): void {
    version.update((v) => v + 1);
  }

  function createEntityNode(id: K, entity: E): EntityNode<E> {
    // Entity-level callable:
    //   node()           → reads current entity (reactive via mapSignal)
    //   node(value)      → full entity replace via updateOne (throws if entity removed)
    //   node(updater)    → updater-based replace via updateOne (throws if entity removed)
    // Resolve the per-entity signal on EVERY read rather than capturing it
    // once. Capturing it made a held node reference permanently dead across a
    // remove -> re-add of the same id: `removeEntitySignal` deletes the signal
    // from the map, the re-add creates a NEW one, and the captured reference
    // kept reading the orphaned signal — `undefined` forever, while a fresh
    // `byId()` worked. Holding a reference to a nested position is the
    // capability this library has and its competitors do not, so it must
    // survive the collection churning underneath it.
    //
    // `getEntitySignal` re-materialises from storage when absent, so a node
    // held across a removal reads `undefined` while the entity is gone and
    // starts reading again the moment it comes back.
    const entitySig = () => getEntitySignal(id)();

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
    let node = nodeCache.get(id)?.deref();
    if (!node) {
      node = createEntityNode(id, entity);
      nodeCache.set(id, new WeakRef(node));
      nodeFinalizer?.register(node, id);
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

    // ── Active entity ───────────────────────────────────────────────────────
    get activeId(): Signal<K | undefined> {
      return activeIdSignal.asReadonly();
    },

    /**
     * Resolved through the per-entity signal, NOT through `mapSignal`.
     *
     * That is the whole reason to build this here rather than leave it to the
     * app: a hand-rolled `computed(() => all().find(e => id(e) === activeId()))`
     * depends on the entire collection, so it recomputes when ANY row changes.
     * This depends on the active row's own signal, so it recomputes only when
     * that row changes — which is what `byId` exists for.
     */
    get activeEntity(): Signal<E | undefined> {
      return (cachedActiveEntity ??= computed(() => {
        const id = activeIdSignal();
        if (id === undefined) return undefined;
        return getEntitySignal(id)();
      }));
    },

    setActiveId(id: K | undefined): void {
      // Not an error when the id is absent: selection frequently outlives the
      // row (a delete arriving from a socket while a detail pane is open), and
      // `activeEntity` already resolves to undefined in that case.
      activeIdSignal.set(id);
    },

    clearActiveId(): void {
      activeIdSignal.set(undefined);
    },

    has(id: K): Signal<boolean> {
      return computed(() => mapSignal().has(id));
    },

    // Bare canonical name (the `.isEmpty` alias was removed in v11).
    get empty(): Signal<boolean> {
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

    /**
     * Insert at the FRONT, reusing `addOne` and then moving the entry.
     *
     * The storage map is insertion-ordered and JS gives no way to unshift one,
     * so the entry order is rebuilt — O(n) in the number of entities. That is
     * still markedly cheaper than the `setAll([entity, ...existing])` this
     * replaces, which rebuilds the storage map AND resets every per-entity
     * signal: only the newcomer's signal changes here, so held nodes survive and
     * no unrelated row's consumers are invalidated.
     *
     * Reusing `addOne` rather than duplicating it keeps duplicate-detection,
     * interceptors, notifier and tap handlers on exactly one path.
     */
    prependOne(entity: E, opts?: AddOptions<E, K>): K {
      const id = api.addOne(entity, opts);
      moveToFront([id]);
      return id;
    },

    prependMany(entities: E[], opts?: AddManyOptions<E, K>): K[] {
      const ids = api.addMany(entities, opts);
      // Front, in the order given — so `prependMany([a, b])` reads back as
      // [a, b, ...existing], which is what the call site looks like.
      moveToFront(ids);
      return ids;
    },

    /**
     * Change an entity's id in place — the missing half of optimistic creation.
     *
     * Insert with a temp id, then adopt the id the server assigned. Everything
     * keyed by the old id moves together: storage (keeping list position), the
     * per-entity signal, the node cache, and the active-entity selection.
     *
     * ⚠️ A node already HELD from `byId(oldId)` does not follow the change — it
     * resolves to `undefined` afterwards. A node closes over its id, so making
     * it follow would mean aliasing the old key to the same signal, and a later
     * `addOne({ id: oldId })` would then silently share one signal between two
     * different entities. Re-read with `byId(newId)` after changing an id.
     *
     * That is a smaller guarantee than remove-then-add gives you — which is
     * none — but it is worth stating precisely rather than implying identity
     * survives. What this buys over remove-then-add is list position, the
     * active selection, and not churning every other row's signals.
     */
    changeId(from: K, to: K): void {
      const entity = storage.get(from);
      if (!entity) {
        throw new Error(`Entity with id ${String(from)} not found`);
      }
      if (from === to) return;
      if (storage.has(to)) {
        throw new Error(`Cannot change id to ${String(to)}: already in use`);
      }

      // Rebuild in order so the row keeps its position.
      const entries = Array.from(storage.entries());
      storage.clear();
      for (const [key, value] of entries) {
        if (key === from) storage.set(to, value);
        else storage.set(key, value);
      }

      // Drop the old per-entity signal rather than aliasing it to the new key:
      // an alias would be shared with a future `addOne({ id: from })`, which is
      // a worse failure than a stale node resolving to undefined.
      entitySignals.delete(from);
      nodeCache.delete(from);
      nodeCache.delete(to);
      if (activeIdSignal() === from) activeIdSignal.set(to);

      syncEntitySignal(to);
      updateSignals();
      pathNotifier.notify(`${basePath}.${String(to)}`, entity, entity);
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
  const warnedWrongMethods = new Set<string>();
  return new Proxy(api as unknown as EntitySignal<E, K>, {
    get: (target: EntitySignal<E, K>, prop: string | symbol) => {
      // Handle string/number bracket access: signal[123] or signal['abc']
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return api.byId(Number(prop) as K);
      }
      // Dev-mode guardrail: a known wrong-method name from another state
      // library → actionable hint instead of a later "undefined is not a
      // function". Only fires for names that are NOT real api members.
      if (
        typeof prop === 'string' &&
        !(prop in (target as object)) &&
        WRONG_ENTITY_METHODS[prop] &&
        (typeof ngDevMode === 'undefined' || ngDevMode) &&
        !warnedWrongMethods.has(prop)
      ) {
        warnedWrongMethods.add(prop);
        console.warn(
          `SignalTree entityMap has no \`.${prop}()\`. Did you mean: ` +
            `${WRONG_ENTITY_METHODS[prop]}? [ST2002]`
        );
      }
      // All other access goes directly to api
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}
