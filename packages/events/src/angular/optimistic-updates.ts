import { computed, Signal, signal } from '@angular/core';

declare const ngDevMode: boolean | undefined;

/**
 * Optimistic Update Manager - Handle optimistic UI updates with rollback
 *
 * Provides:
 * - Track pending updates
 * - Automatic rollback on failure
 * - Correlation with server events
 */
/**
 * Pending optimistic update
 */
export interface OptimisticUpdate<T = unknown> {
  /** Unique ID for tracking */
  id: string;
  /** Correlation ID to match with server response */
  correlationId: string;
  /** Type of update */
  type: string;
  /** Optimistic data applied to UI */
  data: T;
  /** Previous data for rollback */
  previousData: T;
  /** When the update was applied */
  appliedAt: Date;
  /** Timeout for automatic rollback (ms) */
  timeoutMs: number;
  /** Rollback function */
  rollback: () => void;
}

/**
 * Result of an optimistic update
 */
export interface UpdateResult {
  success: boolean;
  correlationId: string;
  error?: Error;
}

/**
 * Optimistic Update Manager
 *
 * Tracks optimistic updates and handles confirmation/rollback.
 *
 * @example
 * ```typescript
 * const manager = new OptimisticUpdateManager();
 *
 * // Apply optimistic update
 * manager.apply({
 *   id: 'update-1',
 *   correlationId: 'corr-123',
 *   type: 'UpdateTradeStatus',
 *   data: { status: 'accepted' },
 *   previousData: { status: 'pending' },
 *   timeoutMs: 5000,
 *   rollback: () => store.$.trade.status.set('pending'),
 * });
 *
 * // When server confirms
 * manager.confirm('corr-123');
 *
 * // Or when server rejects
 * manager.rollback('corr-123', new Error('Server rejected'));
 * ```
 */
export class OptimisticUpdateManager {
  // Source of truth is a plain, mutable Map — NOT the signal itself. Cloning
  // the whole Map on every apply/confirm/rollback (the old `new Map(map)`
  // pattern) is O(pending) per op, so a burst of N ops became O(N^2) overall.
  // Instead we mutate `_map` in place (O(1) per op) and bump a version
  // counter signal to notify dependents once per op. A version NUMBER always
  // compares unequal to its previous value under signal's default equality,
  // so this can't hit the "same reference doesn't notify" pitfall that a
  // naive `set(map)` with an in-place-mutated Map would.
  private readonly _map = new Map<string, OptimisticUpdate>();
  private readonly _version = signal(0);
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private touch(): void {
    this._version.update((v) => v + 1);
  }

  /**
   * Number of pending updates
   */
  readonly pendingCount: Signal<number> = computed(() => {
    this._version();
    return this._map.size;
  });

  /**
   * Whether there are any pending updates
   */
  readonly hasPending: Signal<boolean> = computed(() => {
    this._version();
    return this._map.size > 0;
  });

  /**
   * Get all pending updates
   */
  readonly pending: Signal<OptimisticUpdate[]> = computed(() => {
    this._version();
    return Array.from(this._map.values());
  });

  /**
   * Apply an optimistic update
   */
  apply<T>(update: OptimisticUpdate<T>): void {
    // Store the update
    this._map.set(update.correlationId, update as OptimisticUpdate);
    this.touch();

    // Set timeout for automatic rollback
    const timeout = setTimeout(() => {
      this.rollback(
        update.correlationId,
        new Error(`Optimistic update timeout after ${update.timeoutMs}ms`)
      );
    }, update.timeoutMs);

    this.timeouts.set(update.correlationId, timeout);
  }

  /**
   * Confirm an optimistic update (server accepted)
   */
  confirm(correlationId: string): boolean {
    const update = this._map.get(correlationId);
    if (!update) {
      return false;
    }

    // Clear timeout
    const timeout = this.timeouts.get(correlationId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(correlationId);
    }

    // Remove from pending
    this._map.delete(correlationId);
    this.touch();

    return true;
  }

  /**
   * Rollback an optimistic update (server rejected or timeout)
   */
  rollback(correlationId: string, error?: Error): boolean {
    const update = this._map.get(correlationId);
    if (!update) {
      return false;
    }

    // Clear timeout
    const timeout = this.timeouts.get(correlationId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(correlationId);
    }

    // Execute rollback
    try {
      update.rollback();
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }

    // Remove from pending
    this._map.delete(correlationId);
    this.touch();

    if (error && (typeof ngDevMode === 'undefined' || ngDevMode)) {
      console.warn(`Optimistic update rolled back: ${error.message}`);
    }

    return true;
  }

  /**
   * Rollback all pending updates
   */
  rollbackAll(error?: Error): number {
    const updates = Array.from(this._map.keys());
    let count = 0;

    for (const correlationId of updates) {
      if (this.rollback(correlationId, error)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get update by correlation ID
   */
  get(correlationId: string): OptimisticUpdate | undefined {
    this._version();
    return this._map.get(correlationId);
  }

  /**
   * Check if an update is pending
   */
  isPending(correlationId: string): boolean {
    this._version();
    return this._map.has(correlationId);
  }

  /**
   * Clear all updates without rollback (use with caution)
   */
  clear(): void {
    // Clear all timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    // Clear updates
    this._map.clear();
    this.touch();
  }

  /**
   * Dispose the manager
   */
  dispose(): void {
    this.clear();
  }
}

/**
 * Create an optimistic update manager instance
 */
export function createOptimisticUpdateManager(): OptimisticUpdateManager {
  return new OptimisticUpdateManager();
}

/**
 * The minimal read/write surface `applyOptimisticEntityChange` needs from an
 * entityMap collection. A real `@signaltree/core` `EntitySignal<E, K>`
 * satisfies this structurally — no import from `@signaltree/core` required.
 */
export interface EntitySnapshotAccessor<
  E extends Record<string, unknown>,
  K extends string | number = string
> {
  readonly map: Signal<ReadonlyMap<K, E>>;
  upsertOne(entity: E): K;
  removeOne(id: K): void;
}

/**
 * Result of {@link applyOptimisticEntityChange}: the before/after entity
 * state plus a ready-made `rollback` closure, shaped to drop straight into
 * `OptimisticUpdateManager.apply()`.
 */
export interface EntityOptimisticPatch<E extends Record<string, unknown>> {
  /** The entity as it was immediately before this optimistic write (`undefined` if it didn't exist). */
  previousData: E | undefined;
  /** The entity as it is immediately after this optimistic write. */
  data: E;
  /**
   * Restores `previousData` via `upsertOne`, or — if the entity did not
   * exist before this change (it was a fresh optimistic create) — removes
   * it via `removeOne` instead of resurrecting a partial record.
   */
  rollback: () => void;
}

/**
 * Apply an optimistic change to one entity in an entityMap collection and
 * derive its rollback automatically from the collection's CURRENT entry,
 * instead of requiring a hand-written `rollback` closure for every call
 * site. Purely additive: `OptimisticUpdateManager.apply()`'s `rollback`
 * field still accepts any `() => void`, so existing manual closures keep
 * working unchanged — this just gives you a shortcut for the common
 * "patch one entity, roll back to its previous snapshot" case.
 *
 * @example
 * ```typescript
 * const manager = new OptimisticUpdateManager();
 *
 * const { data, previousData, rollback } = applyOptimisticEntityChange(
 *   store.$.trades.entities,
 *   tradeId,
 *   { status: 'accepted' },
 * );
 *
 * manager.apply({
 *   id: crypto.randomUUID(),
 *   correlationId,
 *   type: 'UpdateTradeStatus',
 *   data,
 *   previousData: previousData ?? data,
 *   timeoutMs: 5000,
 *   rollback, // <- derived, no hand-written closure needed
 * });
 * ```
 */
export function applyOptimisticEntityChange<
  E extends Record<string, unknown>,
  K extends string | number = string
>(
  entities: EntitySnapshotAccessor<E, K>,
  id: K,
  change: Partial<E> | E
): EntityOptimisticPatch<E> {
  const previousData = entities.map().get(id);
  const existed = previousData !== undefined;

  const nextEntity: E = existed
    ? ({ ...previousData, ...change } as E)
    : (change as E);

  entities.upsertOne(nextEntity);

  return {
    previousData,
    data: nextEntity,
    rollback: () => {
      if (existed) {
        entities.upsertOne(previousData as E);
      } else if (entities.map().has(id)) {
        entities.removeOne(id);
      }
    },
  };
}
