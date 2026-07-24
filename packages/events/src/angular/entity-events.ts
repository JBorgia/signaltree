import type { EntitySignal } from '@signaltree/core';

import { BaseEvent } from '../core/types';

/**
 * Entity Events - Bridge between event streams and @signaltree/core entityMap
 *
 * Applying a burst of N domain events to an entityMap one-by-one (via
 * `upsertOne`/`updateOne`/`removeOne` inside a hand-written handler) costs N
 * signal notifications and N O(size) Map clones. entityMap already exposes
 * batch ops (`upsertMany`, `updateMany`, `removeMany`) that collapse a whole
 * batch into ONE notification. `entityEventHandler` maps a batch of events
 * onto those ops so callers get the coalesced write for free — pair it with
 * {@link ../angular/handlers.ts | batchedHandler} to turn a live event
 * stream into periodic, coalesced flushes.
 */

/**
 * The three entityMap mutation intents an event can map to.
 */
export type EntityEventOp = 'upsert' | 'update' | 'remove';

/**
 * Configuration for {@link entityEventHandler}. Each extractor is a pure,
 * cheap function from an event to the data needed for that op — return
 * `undefined` to signal "this event doesn't produce that op".
 *
 * @example
 * ```typescript
 * const mapping: EntityEventMapping<Trade, string, TradeEvent> = {
 *   match: (e) =>
 *     e.type === 'TradeCreated' ? 'upsert' :
 *     e.type === 'TradeStatusChanged' ? 'update' :
 *     e.type === 'TradeCancelled' ? 'remove' : null,
 *   upsert: (e) => (e.type === 'TradeCreated' ? e.data.trade : undefined),
 *   update: (e) =>
 *     e.type === 'TradeStatusChanged'
 *       ? { id: e.data.tradeId, changes: { status: e.data.status } }
 *       : undefined,
 *   remove: (e) => (e.type === 'TradeCancelled' ? e.data.tradeId : undefined),
 * };
 * ```
 */
export interface EntityEventMapping<
  E extends Record<string, unknown>,
  K extends string | number = string,
  T extends BaseEvent = BaseEvent
> {
  /**
   * Decide which op an event maps to. Return `null`/`undefined` to ignore
   * the event entirely (it contributes to no batch op).
   *
   * If omitted, the op is inferred per event by trying `upsert`, then
   * `update`, then `remove` (in that order) and taking the first extractor
   * that returns a defined value.
   */
  match?: (event: T) => EntityEventOp | null | undefined;

  /**
   * Extract an entity (full or partial — merged onto the existing entity if
   * one exists, same semantics as `upsertOne`) to create-or-merge.
   */
  upsert?: (event: T) => E | undefined;

  /** Extract a single-id patch to merge onto an EXISTING entity. */
  update?: (event: T) => { id: K; changes: Partial<E> } | undefined;

  /** Extract the id of an entity to remove. */
  remove?: (event: T) => K | undefined;

  /**
   * How to read an entity's id from the object returned by `upsert`.
   * Defaults to reading `entity.id`, mirroring entityMap's own default
   * `selectId`. Only needed if your entities key off something else.
   */
  selectId?: (entity: E) => K;
}

/** @internal */
function inferOp<
  E extends Record<string, unknown>,
  K extends string | number,
  T extends BaseEvent
>(event: T, mapping: EntityEventMapping<E, K, T>): EntityEventOp | null {
  if (mapping.upsert && mapping.upsert(event) !== undefined) return 'upsert';
  if (mapping.update && mapping.update(event) !== undefined) return 'update';
  if (mapping.remove && mapping.remove(event) !== undefined) return 'remove';
  return null;
}

/** @internal Stable structural key for grouping identical `changes` payloads. */
function stableKey(value: Record<string, unknown>): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

/**
 * Map a *batch* of events onto @signaltree/core's entityMap batch mutation
 * ops so the whole batch produces ONE `upsertMany` call, ONE (or a few)
 * `updateMany` call(s), and ONE `removeMany` call — instead of one
 * notification + one O(size) Map clone per event.
 *
 * Returns a `(events: T[]) => void` flush function — pass it directly as
 * the handler argument to `batchedHandler` (or call it yourself with a
 * buffered array) to turn a live event stream into coalesced writes.
 *
 * **Coalescing rule** (documented, not strict per-event chronology):
 * - Multiple `upsert`/`update` touches to the SAME id within one batch are
 *   folded in arrival order — later fields win — into a single write for
 *   that id.
 * - If an id is created/updated AND removed within the same batch, the
 *   removal always wins, regardless of the two events' relative order:
 *   the id is dropped from the upsert/update pass entirely and only
 *   `removeMany` sees it. This matches the common case (an optimistic row
 *   that gets created then immediately invalidated) without needing to
 *   track true per-id chronology across mixed op types.
 * - `remove` events for ids that are no longer present (already removed,
 *   or never existed) are silently dropped instead of throwing — a batch
 *   may legitimately contain a stale/duplicate remove.
 * - `update` deltas are grouped by structural equality of their `changes`
 *   object before calling `updateMany`, so N events that happen to share
 *   the same delta shape (a common "bulk status change" pattern, e.g. N
 *   `OrderArchived` events each contributing `{ archived: true }`) collapse
 *   into a single `updateMany` call. Distinct deltas still each get their
 *   own `updateMany` call — still far fewer than one call per event when
 *   deltas repeat, and always correct.
 * - `update` events for an id that isn't already in the collection (and
 *   wasn't created earlier in the same batch via `upsert`) throw, matching
 *   `updateMany`'s existing contract. Use `upsert` instead of `update` if
 *   the id might not exist yet.
 *
 * @example
 * ```typescript
 * const flush = entityEventHandler(store.$.trades.entities, {
 *   match: (e) =>
 *     e.type === 'TradeCreated' ? 'upsert' :
 *     e.type === 'TradeStatusChanged' ? 'update' :
 *     e.type === 'TradeCancelled' ? 'remove' : null,
 *   upsert: (e) => (e.type === 'TradeCreated' ? e.data.trade : undefined),
 *   update: (e) =>
 *     e.type === 'TradeStatusChanged'
 *       ? { id: e.data.tradeId, changes: { status: e.data.status } }
 *       : undefined,
 *   remove: (e) => (e.type === 'TradeCancelled' ? e.data.tradeId : undefined),
 * });
 *
 * // Buffer for 50ms (or 200 events), then apply the whole batch as ONE
 * // upsertMany/updateMany/removeMany call instead of N single-entity ops.
 * const onTradeEvent = batchedHandler(flush, 50, 200);
 * websocketService.on('trade-event', onTradeEvent);
 *
 * // Or drive it yourself from an already-batched source:
 * flush(eventsReceivedThisTick);
 * ```
 */
export function entityEventHandler<
  E extends Record<string, unknown>,
  K extends string | number = string,
  T extends BaseEvent = BaseEvent
>(
  entities: EntitySignal<E, K>,
  mapping: EntityEventMapping<E, K, T>
): (events: T[]) => void {
  const selectId: (entity: E) => K =
    mapping.selectId ?? ((entity: E) => entity['id'] as unknown as K);

  return (events: T[]): void => {
    if (events.length === 0) return;

    const removeIds = new Set<K>();
    const touched = new Map<K, { sawUpsert: boolean; payload: Partial<E> }>();

    for (const event of events) {
      const op = mapping.match ? mapping.match(event) : inferOp(event, mapping);
      if (!op) continue;

      if (op === 'upsert' && mapping.upsert) {
        const entity = mapping.upsert(event);
        if (entity === undefined) continue;
        const id = selectId(entity);
        const prev = touched.get(id);
        touched.set(id, {
          sawUpsert: true,
          payload: prev ? { ...prev.payload, ...entity } : { ...entity },
        });
        continue;
      }

      if (op === 'update' && mapping.update) {
        const patch = mapping.update(event);
        if (patch === undefined) continue;
        const prev = touched.get(patch.id);
        touched.set(patch.id, {
          sawUpsert: prev?.sawUpsert ?? false,
          payload: prev
            ? { ...prev.payload, ...patch.changes }
            : { ...patch.changes },
        });
        continue;
      }

      if (op === 'remove' && mapping.remove) {
        const id = mapping.remove(event);
        if (id !== undefined) removeIds.add(id);
      }
    }

    // Removal wins for any id also touched by an upsert/update in this
    // same batch — see the documented coalescing rule above.
    for (const id of removeIds) {
      touched.delete(id);
    }

    const upsertEntities: E[] = [];
    const updateOnly: Array<{ id: K; changes: Partial<E> }> = [];
    for (const [id, t] of touched) {
      if (t.sawUpsert) {
        upsertEntities.push(t.payload as E);
      } else {
        updateOnly.push({ id, changes: t.payload });
      }
    }

    if (upsertEntities.length > 0) {
      entities.upsertMany(upsertEntities, { selectId });
    }

    if (updateOnly.length > 0) {
      const groups = new Map<string, { ids: K[]; changes: Partial<E> }>();
      for (const { id, changes } of updateOnly) {
        const key = stableKey(changes as Record<string, unknown>);
        const group = groups.get(key);
        if (group) {
          group.ids.push(id);
        } else {
          groups.set(key, { ids: [id], changes });
        }
      }
      for (const { ids, changes } of groups.values()) {
        entities.updateMany(ids, changes);
      }
    }

    if (removeIds.size > 0) {
      const live = entities.map();
      const idsToRemove = Array.from(removeIds).filter((id) => live.has(id));
      if (idsToRemove.length > 0) {
        entities.removeMany(idsToRemove);
      }
    }
  };
}
