import { computed, Signal, signal, WritableSignal } from '@angular/core';
import { deepClone } from '@signaltree/shared';

import { EntityValueStore } from './physical/entity-value-store';
import {
  StructuralStore,
  type SubjectLifetimeRecord,
} from './physical/structural-store';
import { PathNotifier } from '../lib/path-notifier';
import { getActiveWriteContext } from '../lib/write-context';
import { HISTORY_EXCLUDED } from './utils';

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

type EntityPositionIdAllocator = () => number | undefined;
let nextStandaloneEntityPositionId = 1;
const standaloneEntityPositionIdAllocator: EntityPositionIdAllocator = () =>
  nextStandaloneEntityPositionId++;
let entityPositionIdAllocatorOverride: EntityPositionIdAllocator | undefined;
let entityPositionIdNotifyEnabled = true;

/** @internal Bench/test-only hook for owner PositionId allocation experiments. */
export function setEntityPositionIdAllocatorForTesting(
  allocator?: EntityPositionIdAllocator
): void {
  entityPositionIdAllocatorOverride = allocator;
}

/** @internal Bench/test-only hook to isolate owner-id carriage from stamping. */
export function setEntityPositionIdNotifyEnabledForTesting(
  enabled = true
): void {
  entityPositionIdNotifyEnabled = enabled;
}

export type EntitySubjectPhysicalInventory<K extends string | number> = {
  subjectId: number;
  state: 'active' | 'tombstoned';
  subjectRevision: number;
  activeKey: K | undefined;
  retainedSubjectState: boolean;
  entitySignal: boolean;
  activationToken: boolean;
  nodeFacadeMaterialized: boolean;
  fieldFacadesMaterialized: readonly string[];
  positionIds: readonly PositionId[] | undefined;
  retainedValueBacking:
  | {
    kind: 'retained-entity-signal';
  }
  | undefined;
};

export type EntitySubjectReclamationResource =
  | 'subject-lifetime-record'
  | 'retained-value-backing'
  | 'subject-activation-channel'
  | 'row-facade'
  | 'field-facades'
  | 'ownership-metadata';

export type EntitySubjectReclamationUnresolved = {
  resource: EntitySubjectReclamationResource;
  reason: 'terminal-facade-dependency-unknown';
};

export type EntitySubjectReclamationPlan = {
  subjectId: number;
  eligible: boolean;
  retire: readonly EntitySubjectReclamationResource[];
  retain: readonly EntitySubjectReclamationResource[];
  unresolved: readonly EntitySubjectReclamationUnresolved[];
};

export type PreparedEntitySubjectReclamation = {
  subjectId: number;
  expectedLifetime: 'tombstoned';
  expectedSubjectRevision: number;
  retire: readonly EntitySubjectReclamationResource[];
  retain: readonly EntitySubjectReclamationResource[];
};

export type EntitySubjectReclamationPlanningOptions = {
  causallyEligible: boolean;
};

export function planEntitySubjectReclamation<K extends string | number>(
  inventory: EntitySubjectPhysicalInventory<K>,
  options: EntitySubjectReclamationPlanningOptions
): EntitySubjectReclamationPlan {
  const retain: EntitySubjectReclamationResource[] = [];

  if (inventory.retainedSubjectState) {
    retain.push('subject-lifetime-record');
  }
  if (inventory.retainedValueBacking) {
    retain.push('retained-value-backing');
  }
  if (inventory.activationToken) {
    retain.push('subject-activation-channel');
  }
  if (inventory.nodeFacadeMaterialized) {
    retain.push('row-facade');
  }
  if (inventory.fieldFacadesMaterialized.length > 0) {
    retain.push('field-facades');
  }
  if ((inventory.positionIds?.length ?? 0) > 0) {
    retain.push('ownership-metadata');
  }

  if (inventory.state !== 'tombstoned') {
    return {
      subjectId: inventory.subjectId,
      eligible: false,
      retire: [],
      retain,
      unresolved: [],
    };
  }

  if (!options.causallyEligible) {
    return {
      subjectId: inventory.subjectId,
      eligible: false,
      retire: [],
      retain,
      unresolved: [],
    };
  }

  const retire: EntitySubjectReclamationResource[] = [];
  const remaining = [...retain];

  if (inventory.retainedValueBacking) {
    retire.push('retained-value-backing');
    const backingIndex = remaining.indexOf('retained-value-backing');
    if (backingIndex !== -1) {
      remaining.splice(backingIndex, 1);
    }
  }

  return {
    subjectId: inventory.subjectId,
    eligible: true,
    retire,
    retain: remaining,
    unresolved: [],
  };
}

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
  UpdateMetadata,
  PositionId,
  StructuralHistoryEffect,
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
  basePath: string,
  options?: {
    positionIdAllocator?: EntityPositionIdAllocator;
    ownerMetadataEnabled?: boolean;
    subjectMetadataEnabled?: boolean;
    positionMetadataEnabled?: boolean;
  }
): EntitySignal<E, K> {
  // ==================
  // CLOSURE STATE (no `this` needed)
  // ==================

  /** Core storage: entity ID -> entity */
  // Derived materialized projection only.
  // Authoritative structural state lives in structuralStore.
  // Authoritative subject values live in valueStore.
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

  function getProjectedEntity(id: K): E | undefined {
    return valueStore.backingForKey(id);
  }

  function getProjectedEntries(): Array<readonly [K, E]> {
    const entries: Array<readonly [K, E]> = [];
    for (const id of structuralStore.activeKeysSnapshot()) {
      const entity = getProjectedEntity(id);
      if (entity !== undefined) {
        entries.push([id, entity] as const);
      }
    }
    return entries;
  }

  function getProjectedEntities(): E[] {
    return getProjectedEntries().map(([, entity]) => entity);
  }

  function rebuildStorageProjection(): void {
    storage.clear();
    for (const [id, entity] of getProjectedEntries()) {
      storage.set(id, entity);
    }
  }

  function writeStorageProjectionEntry(id: K, entity: E): void {
    storage.set(id, entity);
  }

  function snapshotStorageProjection(): ReadonlyMap<K, E> {
    return new Map(storage);
  }

  function rebuildActiveProjectionFromOwners(): ReadonlyMap<K, E> {
    return new Map(getProjectedEntries());
  }

  function clearStorageProjectionForTesting(): void {
    storage.clear();
  }

  /** Reactive signals for queries — all derived, none eagerly maintained. */
  const allSignal: Signal<E[]> = computed(() => {
    version();
    const entities = getProjectedEntities();
    // `sortComparer` gives `all`/`ids` a stable sorted order (parity with
    // @ngrx/entity); `map` keeps insertion order.
    if (config.sortComparer) entities.sort(config.sortComparer);
    return entities;
  });
  const countSignal: Signal<number> = computed(() => {
    version();
    // O(1) — this used to be `entities.length` on a freshly built array.
    return structuralStore.activeKeyCount();
  });
  const idsSignal: Signal<K[]> = computed(() => {
    version();
    return config.sortComparer
      ? allSignal().map((e) => selectId(e))
      : [...structuralStore.activeKeysSnapshot()];
  });
  const mapSignal: Signal<ReadonlyMap<K, E>> = computed(() => {
    version();
    // Still a copy: callers may hold the result across mutations and must not
    // see it change underneath them. But it is paid on read, not on write.
    return new Map(getProjectedEntries());
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
  const entitySignals = new Map<number, WritableSignal<E | undefined>>();
  const structuralStore = new StructuralStore<K>();
  const valueStore = new EntityValueStore<E, K>((key) =>
    structuralStore.subjectIdForKey(key)
  );
  const subjectStateSignals = new Map<number, WritableSignal<number>>();
  const ownerMetadataEnabled = options?.ownerMetadataEnabled ?? true;
  const subjectMetadataEnabled =
    options?.subjectMetadataEnabled ?? ownerMetadataEnabled;
  const positionMetadataEnabled = options?.positionMetadataEnabled ?? true;
  const positionId = (
    options?.positionIdAllocator ??
    (positionMetadataEnabled
      ? entityPositionIdAllocatorOverride ?? standaloneEntityPositionIdAllocator
      : undefined)
  )?.();
  let lastSubjectIds: number[] | undefined;

  type PendingHistoryEffect = StructuralHistoryEffect;
  type PendingAddHistoryEffect = Extract<PendingHistoryEffect, { kind: 'add' }>;

  function getPositionIds(): number[] | undefined {
    return positionId === undefined ? undefined : [positionId];
  }

  function getPositionIdsForNotify(): number[] | undefined {
    return entityPositionIdNotifyEnabled ? getPositionIds() : undefined;
  }

  function createStructuralHistoryMeta(
    effect: PendingHistoryEffect
  ): UpdateMetadata {
    const meta = getActiveWriteContext();
    return {
      ...(meta ?? {}),
      historyEffect: effect,
    };
  }

  function collectOwnedPositions(
    node: unknown,
    positions: Set<PositionId>,
    seen = new WeakSet<object>()
  ): void {
    const direct =
      typeof node === 'object' || typeof node === 'function'
        ? (node as { __positionIds?: readonly number[] }).__positionIds
        : undefined;
    for (const positionId of direct ?? []) {
      positions.add(positionId as PositionId);
    }

    if (
      node === null ||
      node === undefined ||
      (typeof node !== 'object' && typeof node !== 'function')
    ) {
      return;
    }

    const ref = node as object;
    if (seen.has(ref)) {
      return;
    }

    seen.add(ref);

    for (const key of Object.keys(node as Record<string, unknown>)) {
      collectOwnedPositions(
        (node as Record<string, unknown>)[key],
        positions,
        seen
      );
    }
  }

  function deriveSubjectPositions(id: K, entity: E): readonly PositionId[] | undefined {
    const positions = new Set<PositionId>();
    collectOwnedPositions(api, positions);
    collectOwnedPositions(getOrCreateNode(id, entity), positions);
    if (positions.size === 0) {
      return undefined;
    }

    return [...positions].sort((left, right) => left - right);
  }

  /**
   * ST2026 — the inline-predicate trap, caught in dev.
   *
   * `where`/`find` memoise per predicate IDENTITY, so the natural template form
   *
   *     @for (row of tree.$.rows.where(r => !r.done)(); track row.id) { … }
   *
   * allocates a NEW arrow on every change-detection cycle, misses the cache
   * every time, and re-filters the whole collection. Measured over 1,000
   * entities: 0.27ms with a hoisted predicate against 20.54ms inline — **75x**.
   *
   * It is not a leak (the cache is a `WeakMap`; 50,000 inline calls retain ~0MB
   * after forced GC) which is exactly why it needs a diagnostic: nothing grows,
   * nothing breaks, the app is simply slow forever.
   *
   * Detection is by SOURCE TEXT plus RATE, and the rate half is load-bearing.
   *
   * Byte-identical source across many distinct identities is necessary but NOT
   * sufficient: `v => v.x > threshold`, rebuilt whenever `threshold` changes, has
   * identical source too. Counting identities alone cannot tell the two apart,
   * and it eventually accuses BOTH — the first version of this warned after 12
   * distinct identities however long they took to accumulate, so a legitimately
   * dynamic predicate warned during any long session, and the advice it gave
   * ("hoist it") was actively wrong for that shape, because the closure really
   * does differ each time.
   *
   * Rate separates them cleanly, and it is derivable rather than guessed. The
   * trap is driven by CHANGE DETECTION, so it produces a new identity every CD
   * cycle — tens per second. A predicate rebuilt from user input or a filter
   * control produces one per interaction, which is orders of magnitude slower.
   * Anything above ~6/second is a frame loop; nothing a user does reaches it.
   */
  const predicateWindows = new Map<string, { count: number; start: number }>();
  const warnedPredicates = new Set<string>();
  /** Distinct identities within {@link PREDICATE_CHURN_WINDOW_MS} to accuse. */
  const PREDICATE_CHURN_THRESHOLD = 12;
  /** ~6 identities/second is well above user-driven, well below a frame loop. */
  const PREDICATE_CHURN_WINDOW_MS = 2000;

  function warnOnPredicateChurn(
    method: 'where' | 'find',
    predicate: (entity: E) => boolean
  ): void {
    const source = String(predicate);
    // Guard against pathological state growth in a long dev session: the map is
    // only ever as large as the number of DISTINCT predicate sources.
    if (predicateWindows.size > 200 || warnedPredicates.has(source)) return;

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const window = predicateWindows.get(source);
    if (!window || now - window.start > PREDICATE_CHURN_WINDOW_MS) {
      // A fresh window, not an increment. This is what makes a slow drip of
      // legitimately-rebuilt predicates never accumulate to an accusation.
      predicateWindows.set(source, { count: 1, start: now });
      return;
    }
    window.count++;
    if (window.count < PREDICATE_CHURN_THRESHOLD) return;

    warnedPredicates.add(source);
    const perSecond = Math.round(
      (window.count / Math.max(now - window.start, 1)) * 1000
    );
    console.warn(
      `SignalTree: \`${method}()\` received ${window.count} DIFFERENT functions ` +
      `with identical source in ${Math.round(now - window.start)}ms ` +
      `(~${perSecond}/second) — a rate only change detection produces. ` +
      `Results are memoised per predicate IDENTITY, so an inline arrow misses ` +
      `the cache every cycle and re-scans the collection: measured at 75x a ` +
      `hoisted predicate over 1,000 entities. Hoist it to a stable reference ` +
      `(a class field or module constant) and call ` +
      `\`${method}(thePredicate)()\`. Source: ${source.slice(0, 80)} [ST2026]`
    );
  }

  /** Subjects that have moved to a new key and must not fall back to the old one. */
  const rekeyedSubjects = new Set<number>();

  function planRekey(from: K, to: K): {
    commit(): void;
    publish(metaOverride?: UpdateMetadata): void;
  } {
    const entity = getProjectedEntity(from);
    if (!entity) {
      throw new Error(`Entity with id ${String(from)} not found`);
    }
    if (from === to) {
      return {
        commit(): void {
          // no-op
        },
        publish(): void {
          // no-op
        },
      };
    }
    if (structuralStore.hasActiveKey(to)) {
      throw new Error(`Cannot change id to ${String(to)}: already in use`);
    }

    const subjectId = allocateSubjectId(from);
    const historyEffect: PendingHistoryEffect = {
      kind: 'rekey',
      subject: subjectId,
      beforeKey: from,
      afterKey: to,
      subjectPositions: deriveSubjectPositions(from, entity),
    };

    return {
      commit(): void {
        transferSubjectId(from, to);
        rekeyedSubjects.add(subjectId);
        rebuildStorageProjection();

        if (activeIdSignal() === from) {
          activeIdSignal.set(to);
        }

        syncEntitySignal(to);
        updateSignals();
      },
      publish(metaOverride?: UpdateMetadata): void {
        const meta = metaOverride ?? getActiveWriteContext();
        pathNotifier.notify(
          `${basePath}.${String(to)}`,
          entity,
          entity,
          basePath,
          [subjectId],
          getPositionIdsForNotify(),
          {
            ...(meta ?? {}),
            historyEffect,
          }
        );
      },
    };
  }

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
    structuralStore.moveKeysToFront(ids);
    rebuildStorageProjection();
    updateSignals();
  }

  function resolveSubjectId(id: K): number | undefined {
    return structuralStore.subjectIdForKey(id);
  }

  function resolveSubjectState(
    subjectId: number
  ): SubjectLifetimeRecord<K> | undefined {
    return structuralStore.stateForSubject(subjectId);
  }

  function getSubjectRevision(subjectId: number): number {
    return structuralStore.subjectRevision(subjectId);
  }

  function bumpSubjectRevision(subjectId: number): void {
    structuralStore.bumpSubjectRevision(subjectId);
  }

  /** Get (or lazily create) the per-entity signal, seeded from storage. */
  function getEntitySignal(id: K): WritableSignal<E | undefined> {
    const subjectId = resolveSubjectId(id);
    if (subjectId === undefined) {
      return signal<E | undefined>(getProjectedEntity(id));
    }

    let s = entitySignals.get(subjectId);
    if (!s) {
      s = signal<E | undefined>(valueStore.backingForSubject(subjectId));
      entitySignals.set(subjectId, s);
    }
    return s;
  }

  function getSubjectStateSignal(subjectId: number): WritableSignal<number> {
    let s = subjectStateSignals.get(subjectId);
    if (!s) {
      s = signal(0);
      subjectStateSignals.set(subjectId, s);
    }
    return s;
  }

  function bumpSubjectStateSignal(subjectId: number): void {
    getSubjectStateSignal(subjectId).update((value) => value + 1);
  }

  function publishSubjectPhysicalChange(subjectId: number): void {
    bumpSubjectRevision(subjectId);
    bumpSubjectStateSignal(subjectId);
  }

  function allocateSubjectId(id: K): number {
    const existing = structuralStore.subjectIdForKey(id);
    if (existing !== undefined) {
      return existing;
    }

    return commitFreshSubject(id);
  }

  function commitFreshSubject(id: K): number {
    const subjectId = structuralStore.allocateFreshSubjectId();
    structuralStore.createSubject(subjectId, id);
    getSubjectStateSignal(subjectId);
    return subjectId;
  }

  function commitFreshSubjects(ids: readonly K[]): number[] {
    return ids.map((id) => commitFreshSubject(id));
  }

  function rememberSubjectIds(ids: K[]): number[] {
    const resolved = ids.map((id) => allocateSubjectId(id));
    lastSubjectIds = resolved;
    return resolved;
  }

  function transferSubjectId(from: K, to: K): number {
    const subjectId = allocateSubjectId(from);
    structuralStore.transferSubject(subjectId, from, to);
    publishSubjectPhysicalChange(subjectId);
    lastSubjectIds = [subjectId];
    return subjectId;
  }

  function findKeyBySubjectId(subjectId: number): K | undefined {
    return structuralStore.activeKeyForSubject(subjectId);
  }

  function getNeighborSubjects(id: K): {
    beforeSubject?: number;
    afterSubject?: number;
  } {
    return structuralStore.neighborSubjectsForKey(id);
  }

  function resolveRestoreIndex(
    beforeSubject?: number,
    afterSubject?: number
  ): number {
    return structuralStore.restoreIndexForSubjects(beforeSubject, afterSubject);
  }

  function restoreOne(
    key: K,
    entity: E,
    subjectId: number,
    beforeSubject?: number,
    afterSubject?: number
  ): void {
    if (structuralStore.hasActiveKey(key)) {
      throw new Error(`Entity with id ${String(key)} already exists`);
    }

    const state = resolveSubjectState(subjectId);
    if (state && !state.restoreAllowed) {
      throw new Error(
        `Subject ${String(subjectId)} has retired backing and cannot be restored.`
      );
    }

    structuralStore.restoreSubject(
      subjectId,
      key,
      beforeSubject,
      afterSubject,
      state?.restoreAllowed ?? true
    );
    valueStore.retainSubjectValue(subjectId, entity);
    publishSubjectPhysicalChange(subjectId);
    rebuildStorageProjection();
    lastSubjectIds = [subjectId];
    syncEntitySignal(key);
    updateSignals();
    pathNotifier.notify(
      `${basePath}.${String(key)}`,
      entity,
      undefined,
      basePath,
      [subjectId],
      getPositionIdsForNotify()
    );
  }

  function rewritePendingAddEffect(
    effect: PendingAddHistoryEffect,
    beforeSubject?: number,
    afterSubject?: number
  ): void {
    effect.beforeSubject = beforeSubject;
    effect.afterSubject = afterSubject;
  }

  function interceptAddedEntity(entity: E): E {
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

    return transformedEntity;
  }

  function interceptUpdatedEntity(id: K, changes: Partial<E>): Partial<E> {
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

    return transformedChanges;
  }

  function addOneWithHistoryEffect(
    entity: E,
    opts?: AddOptions<E, K>
  ): { id: K; historyEffect: PendingAddHistoryEffect } {
    const id = deriveId(entity, opts);
    const previousKeys = [...structuralStore.activeKeysSnapshot()];

    if (structuralStore.hasActiveKey(id)) {
      throw new Error(`Entity with id ${String(id)} already exists`);
    }

    const transformedEntity = interceptAddedEntity(entity);

    const subjectId = commitFreshSubject(id);
    const beforeKey = previousKeys.at(-1);
    const historyEffect: PendingAddHistoryEffect = {
      kind: 'add',
      subject: subjectId,
      key: id,
      value: deepClone(transformedEntity),
      beforeSubject:
        beforeKey === undefined ? undefined : allocateSubjectId(beforeKey),
      subjectPositions: deriveSubjectPositions(id, transformedEntity),
    };
    valueStore.retainSubjectValue(subjectId, transformedEntity);
    writeStorageProjectionEntry(id, transformedEntity);
    lastSubjectIds = [subjectId];
    invalidateNodeCache(id);
    syncEntitySignal(id);
    updateSignals();

    pathNotifier.notify(
      `${basePath}.${String(id)}`,
      transformedEntity,
      undefined,
      basePath,
      [subjectId],
      getPositionIdsForNotify(),
      createStructuralHistoryMeta(historyEffect)
    );

    for (const handler of tapHandlers) {
      handler.onAdd?.(transformedEntity, id);
    }

    return { id, historyEffect };
  }

  /**
   * Sync one entity's signal from storage after a mutation. No-op if the
   * entity was never materialized (nothing is observing it yet), keeping
   * single-entity writes O(1) regardless of collection size.
   */
  function syncEntitySignal(id: K): void {
    const subjectId = resolveSubjectId(id);
    if (subjectId === undefined) {
      return;
    }

    const s = entitySignals.get(subjectId);
    if (s) s.set(valueStore.backingForSubject(subjectId));
  }

  /**
   * Release one entity's signal on removal: notify current observers that the
   * entity is gone (set undefined), then drop it from the map so churning
   * collections don't accumulate one signal per id ever removed. Held field
   * references stay valid (read undefined); a later byId() after re-add gets a
   * fresh signal.
   */
  function removeEntitySignal(id: K): void {
    const subjectId = resolveSubjectId(id);
    if (subjectId === undefined) {
      return;
    }

    const s = entitySignals.get(subjectId);
    if (s) {
      s.set(undefined);
      entitySignals.delete(subjectId);
    }
  }

  function tombstoneSubjectSignal(subjectId: number): void {
    entitySignals.get(subjectId)?.set(undefined);
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
  const nodeCache = new Map<number, WeakRef<EntityNode<E>>>();
  const nodeFinalizer =
    typeof FinalizationRegistry === 'function'
      ? new FinalizationRegistry<number>((subjectId) => {
        // Only drop the slot if it is still the dead ref — a later byId()
        // may already have installed a live replacement.
        if (nodeCache.get(subjectId)?.deref() === undefined) {
          nodeCache.delete(subjectId);
        }
      })
      : null;

  function invalidateNodeCache(id: K): void {
    const subjectId = resolveSubjectId(id);
    if (subjectId !== undefined) {
      nodeCache.delete(subjectId);
    }
  }

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
        `SignalTree entityMap${basePath ? ` at "${basePath}"` : ''
        }: an entity ` +
        `resolved to id=${String(
          id
        )}. Entities need a stable key — give them ` +
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

  function createEntityNode(subjectId: number, initialKey: K, entity: E): EntityNode<E> {
    // Entity-level callable:
    //   node()           → reads current entity (reactive via mapSignal)
    //   node(value)      → full entity REPLACE (throws if entity removed)
    //   node(updater)    → replace with the updater's return (throws if removed)
    //
    // These replace, and they always claimed to. Until 14.1.1 they delegated to
    // `updateOne`, which spreads (`{ ...entity, ...changes }`) — so the docs said
    // replace and the code merged. The updater form was the worse half: the
    // updater returns a full `E`, it was spread as `Partial<E>`, so an updater
    // that REMOVED a key left the old value in place and nothing said so.
    //
    // Fixed by changing the CODE, not the comment, and the updater form is why
    // there was no other choice: an updater returns a full `E`, so under merge
    // semantics it is IMPOSSIBLE to express removing a key — the spread puts the
    // old value straight back. Merge cannot host this signature. Either the
    // callable replaces or the updater form has to be deleted.
    //
    // Not `setOne(entity)`: that would derive the key via `selectId(entity)`, and
    // `changeId` can leave `entity.id` disagreeing with the storage key, so it has
    // a silent wrong-slot write built in. The explicit form is `replaceOne(id, next)`,
    // which is public and is what this delegates to.
    //
    // MERGE is still available and still positional: `updateOne(id, changes)` for
    // a patch, or `byId(id).field.set(v)` for one field.
    // Resolve the per-entity signal on EVERY read rather than capturing it
    // once. Capturing it made a held node reference permanently dead across a
    // remove -> re-add of the same id: `removeEntitySignal` deletes the signal
    // from the map, the re-add creates a NEW one, and the captured reference
    // kept reading the orphaned signal — `undefined` forever, while a fresh
    // `byId()` worked. Holding a reference to a nested position is the
    // capability this library has and its competitors do not, so it must
    // survive the collection churning underneath it.
    //
    // Subject reachability is now independent from subject retention. A
    // removed subject becomes structurally unreachable by clearing its active
    // key binding, while the retained subject id, signal, and cached node can
    // survive until a separate restoration or reclamation decision.
    const currentKey = (): K | undefined => {
      getSubjectStateSignal(subjectId)();
      return findKeyBySubjectId(subjectId);
    };

    const entitySig = () => {
      const key = currentKey();
      return key === undefined ? undefined : getEntitySignal(key)();
    };

    const node = ((valueOrUpdater?: E | ((current: E) => E)): E | undefined => {
      if (valueOrUpdater === undefined) {
        return entitySig();
      }
      const key = currentKey();
      if (key === undefined) {
        throw new Error(`Entity with subject ${String(subjectId)} not found`);
      }
      const current = getProjectedEntity(key);
      if (current === undefined) {
        throw new Error(`Entity with id ${String(key)} not found`);
      }
      const next =
        typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (c: E) => E)(current)
          : (valueOrUpdater as E);
      api.replaceOne(key, next);
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
          const key = currentKey();
          if (key === undefined) {
            throw new Error(`Entity with subject ${String(subjectId)} not found`);
          }
          api.updateOne(key, { [fieldKey]: value } as Partial<E>);
        },
        update: (
          fn: (current: E[typeof fieldKey] | undefined) => E[typeof fieldKey]
        ) => {
          const key = currentKey();
          if (key === undefined) {
            throw new Error(`Entity with subject ${String(subjectId)} not found`);
          }
          api.updateOne(key, {
            [fieldKey]: fn(entitySig()?.[fieldKey]),
          } as Partial<E>);
        },
        asReadonly: () => fieldSignal,
      });

      if (ownerMetadataEnabled) {
        Object.defineProperty(fieldSignal, '__ownerPath', {
          get: () => {
            const key = currentKey();
            return key === undefined ? undefined : `${basePath}.${String(key)}`;
          },
          enumerable: false,
          configurable: true,
        });
      }
      if (subjectMetadataEnabled) {
        Object.defineProperty(fieldSignal, '__subjectIds', {
          get: () => [subjectId],
          enumerable: false,
          configurable: true,
        });
      }
      if (positionMetadataEnabled) {
        Object.defineProperty(fieldSignal, '__positionIds', {
          get: getPositionIds,
          enumerable: false,
          configurable: true,
        });
      }

      Object.defineProperty(node, key, {
        get: () => fieldSignal,
        enumerable: true,
        configurable: true,
      });
    }

    return node;
  }

  function getOrCreateNode(id: K, entity: E): EntityNode<E> {
    const subjectId = resolveSubjectId(id);
    if (subjectId === undefined) {
      throw new Error(`Entity with id ${String(id)} has no subject id`);
    }

    let node = nodeCache.get(subjectId)?.deref();
    if (!node) {
      node = createEntityNode(subjectId, id, entity);
      nodeCache.set(subjectId, new WeakRef(node));
      nodeFinalizer?.register(node, subjectId);
    }
    return node;
  }

  function inspectSubjectResources(
    subjectId: number
  ): EntitySubjectPhysicalInventory<K> | undefined {
    const subjectState = resolveSubjectState(subjectId);
    if (!subjectState) {
      return undefined;
    }

    const node = nodeCache.get(subjectId)?.deref();
    const fieldFacadesMaterialized =
      node === undefined
        ? []
        : Object.keys(node as Record<string, unknown>).filter((key) =>
          typeof (node as Record<string, unknown>)[key] === 'function'
        ).sort((left, right) => left.localeCompare(right));

    return {
      subjectId,
      state: subjectState.active ? 'active' : 'tombstoned',
      subjectRevision: getSubjectRevision(subjectId),
      activeKey: subjectState.active ? subjectState.key : undefined,
      retainedSubjectState: structuralStore.hasSubject(subjectId),
      entitySignal: entitySignals.has(subjectId),
      activationToken: subjectStateSignals.has(subjectId),
      nodeFacadeMaterialized: node !== undefined,
      fieldFacadesMaterialized,
      positionIds: getPositionIds(),
      retainedValueBacking: valueStore.hasRetainedValueBacking(subjectId)
        ? { kind: 'retained-entity-signal' }
        : undefined,
    };
  }

  function listSubjectReclamationCandidates(): readonly number[] {
    return structuralStore
      .tombstonedSubjectsSnapshot()
      .filter((subjectId) => valueStore.hasRetainedValueBacking(subjectId));
  }

  function prepareSubjectReclamation(
    subjectId: number,
    options: EntitySubjectReclamationPlanningOptions
  ): PreparedEntitySubjectReclamation | undefined {
    const inventory = inspectSubjectResources(subjectId);
    if (!inventory) {
      return undefined;
    }

    const plan = planEntitySubjectReclamation(inventory, options);
    if (!plan.eligible) {
      return undefined;
    }

    return {
      subjectId,
      expectedLifetime: 'tombstoned',
      expectedSubjectRevision: inventory.subjectRevision,
      retire: plan.retire,
      retain: plan.retain,
    };
  }

  function applyPreparedSubjectReclamation(
    prepared: PreparedEntitySubjectReclamation
  ): void {
    const state = resolveSubjectState(prepared.subjectId);
    if (prepared.expectedLifetime !== 'tombstoned') {
      throw new Error(
        `Prepared reclamation for subject ${String(prepared.subjectId)} has an unsupported expected lifetime.`
      );
    }
    if (!state) {
      throw new Error(
        `Prepared reclamation for subject ${String(prepared.subjectId)} no longer matches active lifetime state.`
      );
    }
    if (getSubjectRevision(prepared.subjectId) !== prepared.expectedSubjectRevision) {
      throw new Error(
        `Prepared reclamation for subject ${String(prepared.subjectId)} is stale.`
      );
    }
    if (state.active) {
      throw new Error(
        `Prepared reclamation for subject ${String(prepared.subjectId)} no longer matches active lifetime state.`
      );
    }

    let mutated = false;
    for (const resource of prepared.retire) {
      if (resource === 'retained-value-backing') {
        const hadBacking = valueStore.retireSubjectValue(prepared.subjectId);
        entitySignals.delete(prepared.subjectId);
        structuralStore.retireSubject(prepared.subjectId);
        mutated = hadBacking || mutated;
      }
    }

    if (mutated) {
      publishSubjectPhysicalChange(prepared.subjectId);
    }
  }

  function retireSubjectRetainedValueBackingForTesting(subjectId: number): void {
    const subjectState = resolveSubjectState(subjectId);
    if (!subjectState || subjectState.active) {
      throw new Error(
        `Subject ${String(subjectId)} must be tombstoned before retiring retained value backing.`
      );
    }

    valueStore.retireSubjectValue(subjectId);
    entitySignals.delete(subjectId);
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
      if (structuralStore.hasActiveKey(id)) {
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

    /**
     * The collection as a `ReadonlyMap`, keyed by id.
     *
     * Named `asMap` since 14.1.1. It was `map`, which read as a PROJECTION beside
     * `all()` — every JS developer expects `.map(fn)` to transform elements, and an
     * agent or newcomer reaching for that is a documented failure class (see
     * `WRONG_ENTITY_METHODS`). `asMap` says what it returns.
     */
    get asMap(): Signal<ReadonlyMap<K, E>> {
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
      return computed(() => {
        version();
        return structuralStore.hasActiveKey(id);
      });
    },

    // Bare canonical name (the `.isEmpty` alias was removed in v11).
    get empty(): Signal<boolean> {
      return (cachedEmpty ??= computed(() => countSignal() === 0));
    },

    where(predicate: (entity: E) => boolean): Signal<E[]> {
      const cached = whereCache.get(predicate);
      if (cached) return cached;

      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        warnOnPredicateChurn('where', predicate);
      }
      // Filter DURING iteration rather than materialising `all` and discarding
      // most of it. `allSignal()` builds an array of every entity; `.filter()`
      // then walks it again and keeps a few. Iterating `storage.values()`
      // straight into the result array skips the intermediate entirely.
      //
      // MEASURED in situ, one process per arm, updateOne baseline subtracted.
      // Ranges because the spread across runs is wide — quote the shape, not a
      // point figure:
      //     N=100      1.2us -> 1.3us   (neutral; not worth it at this size)
      //     N=1,000    6.9us -> 2.6us
      //     N=10,000  67-73us -> 24-47us
      //     N=100,000  826us -> 328us
      // So roughly 2-3x from N=1,000 up, and nothing below a few hundred.
      //
      // ⚠️ Measured on a machine running other work. Alternating order
      // (after/before/after) held the ordering and the two `after` runs
      // agreed, so the DIRECTION is sound and the ranges do not overlap —
      // but treat the magnitudes as indicative and re-measure quiet before
      // publishing any of them.
      //
      // Only valid WITHOUT `sortComparer`. With one, `allSignal()` sorts, so
      // bypassing it would silently return insertion order instead of sorted
      // order — a behaviour change, not an optimisation. Without one,
      // `allSignal()` is `Array.from(storage.values())`, so the fast path is
      // order-IDENTICAL rather than merely order-equivalent.
      //
      // `version()` is read directly for the same invalidation `allSignal()`
      // has; the sorted branch gets it transitively.
      const s = computed(() => {
        if (config.sortComparer) return allSignal().filter(predicate);
        version();
        const out: E[] = [];
        for (const entity of getProjectedEntities()) {
          if (predicate(entity)) out.push(entity);
        }
        return out;
      });
      whereCache.set(predicate, s);
      return s;
    },

    find(predicate: (entity: E) => boolean): Signal<E | undefined> {
      const cached = findCache.get(predicate);
      if (cached) return cached;

      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        warnOnPredicateChurn('find', predicate);
      }
      // Same bypass as `where`, and the win here is algorithmic rather than a
      // constant factor: `allSignal().find()` builds the WHOLE array before
      // looking at the first element, so a match at index 5 of 10,000 still
      // costs O(N). Iterating stops at the match.
      //
      // MEASURED in situ at 10k, updateOne baseline subtracted:
      //     match at the END    52-61us -> 12-20us   (~3-5x)
      //     match at index 5      13.6us -> 0.2us    (~50x)
      // The second is the point: `find` goes from O(N) ALWAYS to O(position).
      // The first is the same intermediate-array saving as `where`.
      //
      // Sorted collections keep the old path: `find` returns the FIRST match,
      // which is order-dependent, so with a `sortComparer` the sorted array is
      // the only correct thing to scan. See the note on `where` above.
      const s = computed(() => {
        if (config.sortComparer) return allSignal().find(predicate);
        version();
        for (const entity of getProjectedEntities()) {
          if (predicate(entity)) return entity;
        }
        return undefined;
      });
      findCache.set(predicate, s);
      return s;
    },

    // ==================
    // MUTATIONS: ADD
    // ==================

    addOne(entity: E, opts?: AddOptions<E, K>): K {
      return addOneWithHistoryEffect(entity, opts).id;
    },

    /**
     * Insert at the FRONT, reusing `addOne` and then moving the entry.
     *
        if (structuralStore.hasActiveKey(id)) {
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
      const previousFirstKey = structuralStore.firstActiveKey();
      const { id, historyEffect } = addOneWithHistoryEffect(entity, opts);
      moveToFront([id]);
      rewritePendingAddEffect(
        historyEffect,
        undefined,
        previousFirstKey === undefined
          ? undefined
          : allocateSubjectId(previousFirstKey)
      );
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
    * Held row/field references follow the rekey by SUBJECT identity rather than
    * by the old key. The old lookup disappears, but already-materialized row
    * state, metadata, and field signals remain attached to the same subject.
    * That keeps list position, active selection, and row-local reactivity while
    * still allowing the freed id to be reused by a different subject.
     */
    changeId(from: K, to: K): void {
      const planned = planRekey(from, to);
      planned.commit();
      planned.publish();
    },

    addMany(entities: E[], opts?: AddManyOptions<E, K>): K[] {
      const mode = opts?.mode ?? 'strict';

      // First pass: validate/filter based on mode
      const toProcess: Array<{
        entity: E;
        id: K;
        existingSubjectId?: number;
      }> = [];
      for (const entity of entities) {
        const id = deriveId(entity, opts);
        const existingSubjectId = structuralStore.subjectIdForKey(id);
        if (existingSubjectId !== undefined) {
          if (mode === 'strict') {
            throw new Error(`Entity with id ${String(id)} already exists`);
          } else if (mode === 'skip') {
            continue;
          }
          // 'overwrite': fall through — the projection helper below replaces the existing entry
        }
        toProcess.push({ entity, id, existingSubjectId });
      }

      if (toProcess.length === 0) return [];

      // Stage all add work before mutating runtime state so a later failure
      // cannot partially allocate fresh subject lifetimes.
      const stagedAdds = toProcess.map(({ entity, id, existingSubjectId }) => ({
        id,
        entity: interceptAddedEntity(entity),
        existingSubjectId,
      }));

      const freshIds = stagedAdds
        .filter(({ existingSubjectId }) => existingSubjectId === undefined)
        .map(({ id }) => id);
      const freshSubjectIds = commitFreshSubjects(freshIds);
      const subjectIdsByKey = new Map<K, number>();
      let freshIndex = 0;
      for (const { id, existingSubjectId } of stagedAdds) {
        const subjectId =
          existingSubjectId ?? freshSubjectIds[freshIndex++];
        subjectIdsByKey.set(id, subjectId);
      }

      // Process all entities without triggering per-entity signal updates
      const processedIds: K[] = [];
      const addedEntities: Array<{ id: K; entity: E; subjectId: number }> = [];

      for (const { entity: transformedEntity, id } of stagedAdds) {
        const subjectId = subjectIdsByKey.get(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        writeStorageProjectionEntry(id, transformedEntity);
        valueStore.retainSubjectValue(subjectId, transformedEntity);
        invalidateNodeCache(id);
        syncEntitySignal(id);
        processedIds.push(id);
        addedEntities.push({ id, entity: transformedEntity, subjectId });
      }

      // Single signal update after all entities are processed
      updateSignals();

      const subjectIdsForWrite = processedIds.map((id) => {
        const subjectId = subjectIdsByKey.get(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        return subjectId;
      });
      lastSubjectIds = subjectIdsForWrite;

      const previousKeys = structuralStore
        .activeKeysSnapshot()
        .slice(0, -freshIds.length);

      // Notify PathNotifier for each processed entity
      for (let i = 0; i < addedEntities.length; i++) {
        const { id, entity } = addedEntities[i];
        const beforeKey = previousKeys.at(i + previousKeys.length - addedEntities.length);
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          entity,
          undefined,
          basePath,
          [subjectIdsForWrite[i]],
          getPositionIdsForNotify(),
          createStructuralHistoryMeta({
            kind: 'add',
            subject: subjectIdsForWrite[i],
            key: id,
            value: deepClone(entity),
            beforeSubject:
              beforeKey === undefined ? undefined : allocateSubjectId(beforeKey),
            subjectPositions: deriveSubjectPositions(id, entity),
          })
        );
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
      const entity = getProjectedEntity(id);
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
      const subjectIdsForWrite = rememberSubjectIds([id]);
      valueStore.retainSubjectValue(subjectIdsForWrite[0], finalUpdated);
      writeStorageProjectionEntry(id, finalUpdated);
      syncEntitySignal(id);
      updateSignals();

      // Notify PathNotifier
      pathNotifier.notify(
        `${basePath}.${String(id)}`,
        finalUpdated,
        prev,
        basePath,
        subjectIdsForWrite,
        getPositionIdsForNotify(),
        getActiveWriteContext()
      );

      // Run tap handlers
      for (const handler of tapHandlers) {
        handler.onUpdate?.(id, transformedChanges, finalUpdated);
      }
    },

    /**
     * Replace, not merge — and the write path behind `byId(id)(next)`.
     *
     * Identical to `updateOne` except the one line that matters: assign the whole
     * entity instead of spreading it over the current one. That single difference
     * is the only way to REMOVE a key, which `updateOne` cannot express at all.
     *
     * **Why `replaceOne(id, entity)` and not `setOne(entity)`.** The id comes from
     * the caller on purpose. A `setOne` deriving it via `selectId(entity)` writes
     * to whatever slot the entity's own id field names — and `changeId` can leave
     * `entity.id` disagreeing with the storage key, so that form has a silent
     * wrong-slot write built into it. This one cannot drift.
     */
    replaceOne(id: K, entity: E): void {
      const prev = getProjectedEntity(id);
      if (!prev) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }

      let next = entity;
      for (const handler of interceptHandlers) {
        const ctx: InterceptContext<Partial<E>> = {
          block: (reason?: string) => {
            throw new Error(
              `Cannot replace entity: ${reason || 'blocked by interceptor'}`
            );
          },
          transform: (value: Partial<E>) => {
            next = value as E;
          },
          blocked: false,
          blockReason: undefined,
        };
        handler.onUpdate?.(id, entity as Partial<E>, ctx);
      }

        valueStore.retainValueForKey(id, next);
        writeStorageProjectionEntry(id, next);
      syncEntitySignal(id);
      updateSignals();
      pathNotifier.notify(
        `${basePath}.${String(id)}`,
        next,
        prev,
        basePath,
        undefined,
        getPositionIdsForNotify(),
        getActiveWriteContext()
      );
      for (const handler of tapHandlers) {
        handler.onUpdate?.(id, next as Partial<E>, next);
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
        const entity = getProjectedEntity(id);
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
        valueStore.retainValueForKey(id, finalUpdated);
        writeStorageProjectionEntry(id, finalUpdated);
        syncEntitySignal(id);
        updatedEntities.push({ id, prev, finalUpdated, transformedChanges });
      }

      // Single signal update after all entities are updated
      updateSignals();

      const subjectIdsForWrite = rememberSubjectIds(ids);

      // Notify PathNotifier for each updated entity
      for (let i = 0; i < updatedEntities.length; i++) {
        const { id, prev, finalUpdated } = updatedEntities[i];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          finalUpdated,
          prev,
          basePath,
          [subjectIdsForWrite[i]],
          getPositionIdsForNotify(),
          getActiveWriteContext()
        );
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
      for (const [id, entity] of getProjectedEntries()) {
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
      const entity = getProjectedEntity(id);
      if (!entity) {
        throw new Error(`Entity with id ${String(id)} not found`);
      }
      const { beforeSubject, afterSubject } = getNeighborSubjects(id);

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
      const subjectIdsForWrite = rememberSubjectIds([id]);
      const historyEffect: PendingHistoryEffect = {
        kind: 'remove',
        subject: subjectIdsForWrite[0],
        key: id,
        value: deepClone(entity),
        beforeSubject,
        afterSubject,
        subjectPositions: deriveSubjectPositions(id, entity),
      };
      const currentState = resolveSubjectState(subjectIdsForWrite[0]);
      structuralStore.tombstoneSubject(
        subjectIdsForWrite[0],
        id,
        currentState?.restoreAllowed ?? true
      );
      publishSubjectPhysicalChange(subjectIdsForWrite[0]);
      tombstoneSubjectSignal(subjectIdsForWrite[0]);
      rebuildStorageProjection();
      updateSignals();

      // Notify PathNotifier
      pathNotifier.notify(
        `${basePath}.${String(id)}`,
        undefined,
        entity,
        basePath,
        subjectIdsForWrite,
        getPositionIdsForNotify(),
        createStructuralHistoryMeta(historyEffect)
      );

      // Run tap handlers
      for (const handler of tapHandlers) {
        handler.onRemove?.(id, entity);
      }
    },

    removeMany(ids: K[]): void {
      if (ids.length === 0) return;

      // Collect entities and run interceptors first
      const preparedRemovals: Array<{
        id: K;
        entity: E;
        subjectId: number;
        beforeSubject?: number;
        afterSubject?: number;
        subjectPositions?: readonly PositionId[];
      }> = [];
      for (const id of ids) {
        const entity = getProjectedEntity(id);
        if (!entity) {
          throw new Error(`Entity with id ${String(id)} not found`);
        }
        const subjectId = resolveSubjectId(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        const { beforeSubject, afterSubject } = getNeighborSubjects(id);
        const subjectPositions = deriveSubjectPositions(id, entity);

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

        preparedRemovals.push({
          id,
          entity,
          subjectId,
          beforeSubject,
          afterSubject,
          subjectPositions,
        });
      }

      const subjectIdsForWrite = preparedRemovals.map(({ subjectId }) => subjectId);
      lastSubjectIds = subjectIdsForWrite;

      for (const { id, subjectId } of preparedRemovals) {
        const currentState = resolveSubjectState(subjectId);
        structuralStore.tombstoneSubject(
          subjectId,
          id,
          currentState?.restoreAllowed ?? true
        );
        publishSubjectPhysicalChange(subjectId);
        tombstoneSubjectSignal(subjectId);
      }

      rebuildStorageProjection();

      // Single signal update after all entities are removed
      updateSignals();

      // Notify PathNotifier for each removed entity
      for (let i = 0; i < preparedRemovals.length; i++) {
        const {
          id,
          entity,
          beforeSubject,
          afterSubject,
          subjectPositions,
        } = preparedRemovals[i];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          undefined,
          entity,
          basePath,
          [subjectIdsForWrite[i]],
          getPositionIdsForNotify(),
          createStructuralHistoryMeta({
            kind: 'remove',
            subject: subjectIdsForWrite[i],
            key: id,
            value: deepClone(entity),
            beforeSubject,
            afterSubject,
            subjectPositions,
          })
        );
      }

      // Run tap handlers for each removed entity
      for (const { id, entity } of preparedRemovals) {
        for (const handler of tapHandlers) {
          handler.onRemove?.(id, entity);
        }
      }
    },

    removeWhere(predicate: (entity: E) => boolean): number {
      const idsToRemove: K[] = [];
      for (const [id, entity] of getProjectedEntries()) {
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
      if (structuralStore.hasActiveKey(id)) {
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
      const toUpdate: Array<{ entity: E; id: K; prev: E; subjectId: number }> = [];

      for (const entity of entities) {
        const id = deriveId(entity, opts);
        const existing = getProjectedEntity(id);
        if (existing !== undefined) {
          const subjectId = resolveSubjectId(id);
          if (subjectId === undefined) {
            throw new Error(`Entity with id ${String(id)} has no subject id`);
          }
          toUpdate.push({ entity, id, prev: existing, subjectId });
        } else {
          toAdd.push({ entity, id });
        }
      }

      const stagedAdds = toAdd.map(({ entity, id }) => ({
        id,
        entity: interceptAddedEntity(entity),
      }));

      const stagedUpdates = toUpdate.map(({ entity, id, prev, subjectId }) => {
        const transformedChanges = interceptUpdatedEntity(id, entity);
        return {
          id,
          subjectId,
          prev,
          transformedChanges,
          finalUpdated: { ...prev, ...transformedChanges },
        };
      });

      const freshSubjectIds = commitFreshSubjects(stagedAdds.map(({ id }) => id));
      const addedSubjectIdsByKey = new Map<K, number>();
      for (let i = 0; i < stagedAdds.length; i++) {
        addedSubjectIdsByKey.set(stagedAdds[i].id, freshSubjectIds[i]);
      }

      // Process adds
      const addedEntities: Array<{ id: K; entity: E; subjectId: number }> = [];
      for (const { entity: transformedEntity, id } of stagedAdds) {
        const subjectId = addedSubjectIdsByKey.get(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        valueStore.retainSubjectValue(subjectId, transformedEntity);
        writeStorageProjectionEntry(id, transformedEntity);
        invalidateNodeCache(id);
        syncEntitySignal(id);
        addedEntities.push({ id, entity: transformedEntity, subjectId });
      }

      const updatedEntities: Array<{
        id: K;
        subjectId: number;
        prev: E;
        finalUpdated: E;
        transformedChanges: Partial<E>;
      }> = [];
      for (const {
        id,
        subjectId,
        prev,
        finalUpdated,
        transformedChanges,
      } of stagedUpdates) {
        valueStore.retainSubjectValue(subjectId, finalUpdated);
        writeStorageProjectionEntry(id, finalUpdated);
        syncEntitySignal(id);
        updatedEntities.push({ id, subjectId, prev, finalUpdated, transformedChanges });
      }

      // Single signal update after all entities are processed
      updateSignals();

      const addedSubjectIdsForWrite = addedEntities.map(({ subjectId }) => subjectId);
      const updatedSubjectIdsForWrite = updatedEntities.map(({ subjectId }) => subjectId);
      lastSubjectIds = [...addedSubjectIdsForWrite, ...updatedSubjectIdsForWrite];

      // Notify PathNotifier for added entities
      for (let i = 0; i < addedEntities.length; i++) {
        const { id, entity } = addedEntities[i];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          entity,
          undefined,
          basePath,
          [addedSubjectIdsForWrite[i]],
          getPositionIdsForNotify()
        );
      }

      // Notify PathNotifier for updated entities
      for (let i = 0; i < updatedEntities.length; i++) {
        const { id, prev, finalUpdated } = updatedEntities[i];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          finalUpdated,
          prev,
          basePath,
          [updatedSubjectIdsForWrite[i]],
          getPositionIdsForNotify()
        );
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
      const activeIds = structuralStore.activeKeysSnapshot();
      const activeSubjects = activeIds.map((id) => {
        const subjectId = resolveSubjectId(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        return { id, subjectId };
      });

      for (const { id, subjectId } of activeSubjects) {
        const currentState = resolveSubjectState(subjectId);
        structuralStore.tombstoneSubject(
          subjectId,
          id,
          currentState?.restoreAllowed ?? true
        );
        publishSubjectPhysicalChange(subjectId);
      }

      rebuildStorageProjection();
      activeIdSignal.set(undefined);
      lastSubjectIds = activeSubjects.map(({ subjectId }) => subjectId);
      resetEntitySignals();
      updateSignals();
    },

    setAll(entities: E[], opts?: AddOptions<E, K>): void {
      const currentEntries = getProjectedEntries();
      const currentIds = new Set(currentEntries.map(([id]) => id));
      const stagedIncomingIds: K[] = [];
      const stagedIncomingById = new Map<K, E>();

      for (const entity of entities) {
        const id = deriveId(entity, opts);
        const transformedEntity = currentIds.has(id)
          ? (() => {
            let replacement = entity;
            for (const handler of interceptHandlers) {
              const ctx: InterceptContext<Partial<E>> = {
                block: (reason?: string) => {
                  throw new Error(
                    `Cannot replace entity: ${reason || 'blocked by interceptor'}`
                  );
                },
                transform: (value: Partial<E>) => {
                  replacement = value as E;
                },
                blocked: false,
                blockReason: undefined,
              };
              handler.onUpdate?.(id, entity as Partial<E>, ctx);
            }
            return replacement;
          })()
          : interceptAddedEntity(entity);

        if (!stagedIncomingById.has(id)) {
          stagedIncomingIds.push(id);
        }
        stagedIncomingById.set(id, transformedEntity);
      }

      const stagedRemovals = currentEntries
        .filter(([id]) => !stagedIncomingById.has(id))
        .map(([id, entity]) => {
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

          const subjectId = resolveSubjectId(id);
          if (subjectId === undefined) {
            throw new Error(`Entity with id ${String(id)} has no subject id`);
          }
          return {
            id,
            entity,
            subjectId,
          };
        });

      const stagedUpdates = stagedIncomingIds
        .filter((id) => currentIds.has(id))
        .map((id) => {
          const prev = getProjectedEntity(id);
          const entity = stagedIncomingById.get(id);
          if (prev === undefined || entity === undefined) {
            throw new Error(`Entity with id ${String(id)} not found`);
          }

          const subjectId = resolveSubjectId(id);
          if (subjectId === undefined) {
            throw new Error(`Entity with id ${String(id)} has no subject id`);
          }

          return {
            id,
            prev,
            entity,
            subjectId,
          };
        });
      const survivingOriginalIds = new Set(stagedUpdates.map(({ id }) => id));

      const stagedAdds = stagedIncomingIds
        .filter((id) => !currentIds.has(id))
        .map((id) => {
          const entity = stagedIncomingById.get(id);
          if (entity === undefined) {
            throw new Error(`Entity with id ${String(id)} not found`);
          }

          return { id, entity };
        });

      const finalIndexById = new Map(
        stagedIncomingIds.map((id, index) => [id, index] as const)
      );

      const freshSubjectIds = commitFreshSubjects(stagedAdds.map(({ id }) => id));
      const freshSubjectIdsByKey = new Map<K, number>();
      for (let index = 0; index < stagedAdds.length; index += 1) {
        freshSubjectIdsByKey.set(stagedAdds[index].id, freshSubjectIds[index]);
      }

      const stagedRemovalHistoryEffects = stagedRemovals.map(
        ({ id, entity, subjectId }) => {
          const currentIndex = currentEntries.findIndex(
            ([entryId]) => entryId === id
          );
          let beforeSubject: number | undefined;
          let afterSubject: number | undefined;

          for (let index = currentIndex - 1; index >= 0; index -= 1) {
            const neighborId = currentEntries[index]?.[0];
            if (neighborId !== undefined && survivingOriginalIds.has(neighborId)) {
              beforeSubject = resolveSubjectId(neighborId);
              break;
            }
          }

          for (
            let index = currentIndex + 1;
            index < currentEntries.length;
            index += 1
          ) {
            const neighborId = currentEntries[index]?.[0];
            if (neighborId !== undefined && survivingOriginalIds.has(neighborId)) {
              afterSubject = resolveSubjectId(neighborId);
              break;
            }
          }

          return {
            kind: 'remove' as const,
            subject: subjectId,
            key: id,
            value: deepClone(entity),
            beforeSubject,
            afterSubject,
            subjectPositions: deriveSubjectPositions(id, entity),
          };
        }
      );

      for (const { id, subjectId } of stagedRemovals) {
        tombstoneSubjectSignal(subjectId);
        const currentState = resolveSubjectState(subjectId);
        structuralStore.tombstoneSubject(
          subjectId,
          id,
          currentState?.restoreAllowed ?? true
        );
        publishSubjectPhysicalChange(subjectId);
      }

      for (const { subjectId, entity } of stagedUpdates) {
        valueStore.retainSubjectValue(subjectId, entity);
      }

      const addedSubjectIds = stagedAdds.map(({ id, entity }) => {
        const subjectId = freshSubjectIdsByKey.get(id);
        if (subjectId === undefined) {
          throw new Error(`Entity with id ${String(id)} has no subject id`);
        }
        valueStore.retainSubjectValue(subjectId, entity);
        syncEntitySignal(id);
        return subjectId;
      });

      for (const { id } of stagedUpdates) {
        syncEntitySignal(id);
      }

      structuralStore.reorderActiveKeys(stagedIncomingIds);
      rebuildStorageProjection();

      lastSubjectIds = [
        ...stagedRemovals.map(({ subjectId }) => subjectId),
        ...stagedUpdates.map(({ subjectId }) => subjectId),
        ...addedSubjectIds,
      ];

      const stagedAddHistoryEffects = stagedAdds.map(({ id, entity }, index) => {
        const subjectId = addedSubjectIds[index];
        const finalIndex = finalIndexById.get(id) ?? -1;
        let beforeSubject: number | undefined;
        let afterSubject: number | undefined;

        for (let cursor = finalIndex - 1; cursor >= 0; cursor -= 1) {
          const neighborId = stagedIncomingIds[cursor];
          if (neighborId === undefined) {
            continue;
          }
          beforeSubject = resolveSubjectId(neighborId);
          if (beforeSubject !== undefined) {
            break;
          }
        }

        for (
          let cursor = finalIndex + 1;
          cursor < stagedIncomingIds.length;
          cursor += 1
        ) {
          const neighborId = stagedIncomingIds[cursor];
          if (neighborId === undefined) {
            continue;
          }
          afterSubject = resolveSubjectId(neighborId);
          if (afterSubject !== undefined) {
            break;
          }
        }

        return {
          kind: 'add' as const,
          subject: subjectId,
          key: id,
          value: deepClone(entity),
          beforeSubject,
          afterSubject,
          subjectPositions: deriveSubjectPositions(id, entity),
        };
      });

      updateSignals();

      for (let index = 0; index < stagedRemovals.length; index += 1) {
        const { id, entity, subjectId } = stagedRemovals[index];
        const historyEffect = stagedRemovalHistoryEffects[index];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          undefined,
          entity,
          basePath,
          [subjectId],
          getPositionIdsForNotify(),
          createStructuralHistoryMeta(historyEffect)
        );
      }

      for (const { id, prev, entity, subjectId } of stagedUpdates) {
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          entity,
          prev,
          basePath,
          subjectId === undefined ? undefined : [subjectId],
          getPositionIdsForNotify(),
          getActiveWriteContext()
        );
      }

      for (let i = 0; i < stagedAdds.length; i++) {
        const { id, entity } = stagedAdds[i];
        pathNotifier.notify(
          `${basePath}.${String(id)}`,
          entity,
          undefined,
          basePath,
          [addedSubjectIds[i]],
          getPositionIdsForNotify(),
          createStructuralHistoryMeta(stagedAddHistoryEffects[i])
        );
      }

      for (const { id, entity } of stagedRemovals) {
        for (const handler of tapHandlers) {
          handler.onRemove?.(id, entity);
        }
      }

      for (const { id, entity } of stagedAdds) {
        for (const handler of tapHandlers) {
          handler.onAdd?.(entity, id);
        }
      }

      for (const { id, entity } of stagedUpdates) {
        for (const handler of tapHandlers) {
          handler.onUpdate?.(id, entity as Partial<E>, entity);
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
  // HISTORY SCOPE
  // ==================

  // `recordHistory: false` marks this collection as excluded from time-travel
  // capture WITHOUT excluding it from any other snapshot consumer. Stamped on
  // the node rather than held in a side table so the pruner can ask the value
  // it already has, and `SignalTree:`-prefixed so `unwrap`'s symbol loop skips
  // it and it never reaches a payload. See RFC 0012.
  if (config.recordHistory === false) {
    Object.defineProperty(api, HISTORY_EXCLUDED, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
  if (subjectMetadataEnabled) {
    Object.defineProperty(api, '__subjectIds', {
      get: () => lastSubjectIds,
      enumerable: false,
      configurable: true,
    });
  }
  if (positionMetadataEnabled) {
    Object.defineProperty(api, '__positionIds', {
      get: getPositionIds,
      enumerable: false,
      configurable: true,
    });
  }
  Object.defineProperty(api, '__findKeyBySubjectId', {
    value: findKeyBySubjectId,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__restoreOne', {
    value: restoreOne,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__planRekey', {
    value: planRekey,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__inspectSubjectResources', {
    value: inspectSubjectResources,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__listSubjectReclamationCandidates', {
    value: listSubjectReclamationCandidates,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__snapshotStorageProjectionForTesting', {
    value: snapshotStorageProjection,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__rebuildActiveProjectionFromOwnersForTesting', {
    value: rebuildActiveProjectionFromOwners,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__clearStorageProjectionForTesting', {
    value: clearStorageProjectionForTesting,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__rebuildStorageProjectionForTesting', {
    value: rebuildStorageProjection,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__planSubjectReclamation', {
    value: (
      subjectId: number,
      options: EntitySubjectReclamationPlanningOptions
    ) => {
      const inventory = inspectSubjectResources(subjectId);
      return inventory ? planEntitySubjectReclamation(inventory, options) : undefined;
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__prepareSubjectReclamation', {
    value: prepareSubjectReclamation,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__applyPreparedSubjectReclamation', {
    value: applyPreparedSubjectReclamation,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(api, '__retireSubjectRetainedValueBackingForTesting', {
    value: retireSubjectRetainedValueBackingForTesting,
    enumerable: false,
    configurable: true,
  });

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

Object.defineProperty(createEntitySignal, '__setPositionIdAllocatorForTesting', {
  value: setEntityPositionIdAllocatorForTesting,
  enumerable: false,
  configurable: true,
});
Object.defineProperty(createEntitySignal, '__setPositionIdNotifyEnabledForTesting', {
  value: setEntityPositionIdNotifyEnabledForTesting,
  enumerable: false,
  configurable: true,
});
