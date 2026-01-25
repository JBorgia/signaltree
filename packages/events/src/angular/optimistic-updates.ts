import { computed, Signal, signal } from '@angular/core';

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
  private readonly _updates = signal<Map<string, OptimisticUpdate>>(new Map());
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Number of pending updates
   */
  readonly pendingCount: Signal<number> = computed(() => this._updates().size);

  /**
   * Whether there are any pending updates
   */
  readonly hasPending: Signal<boolean> = computed(
    () => this._updates().size > 0
  );

  /**
   * Get all pending updates
   */
  readonly pending: Signal<OptimisticUpdate[]> = computed(() =>
    Array.from(this._updates().values())
  );

  /**
   * Apply an optimistic update
   */
  apply<T>(update: OptimisticUpdate<T>): void {
    // Store the update
    this._updates.update((map) => {
      const newMap = new Map(map);
      newMap.set(update.correlationId, update as OptimisticUpdate);
      return newMap;
    });

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
    const update = this._updates().get(correlationId);
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
    this._updates.update((map) => {
      const newMap = new Map(map);
      newMap.delete(correlationId);
      return newMap;
    });

    return true;
  }

  /**
   * Rollback an optimistic update (server rejected or timeout)
   */
  rollback(correlationId: string, error?: Error): boolean {
    const update = this._updates().get(correlationId);
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
    this._updates.update((map) => {
      const newMap = new Map(map);
      newMap.delete(correlationId);
      return newMap;
    });

    if (error) {
      console.warn(`Optimistic update rolled back: ${error.message}`);
    }

    return true;
  }

  /**
   * Rollback all pending updates
   */
  rollbackAll(error?: Error): number {
    const updates = Array.from(this._updates().keys());
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
    return this._updates().get(correlationId);
  }

  /**
   * Check if an update is pending
   */
  isPending(correlationId: string): boolean {
    return this._updates().has(correlationId);
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
    this._updates.set(new Map());
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
