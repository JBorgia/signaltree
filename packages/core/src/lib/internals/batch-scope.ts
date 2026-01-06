/**
 * Lightweight batching for partial updates.
 *
 * When multiple signal writes occur within a batchScope, Angular's change
 * detection sees them as a single batch of updates, resulting in a single
 * CD cycle instead of multiple cycles.
 *
 * @internal
 */

let batchDepth = 0;

/**
 * Execute a function with batched change detection.
 * Nested calls are flattened - only outermost scope matters.
 *
 * Signal values update immediately (synchronous), but Angular's
 * change detection consolidates all updates into a single cycle.
 *
 * @param fn - Function containing signal updates
 *
 * @example
 * ```typescript
 * // Without batchScope: 3 CD cycles
 * $.a.set(1);
 * $.b.set(2);
 * $.c.set(3);
 *
 * // With batchScope: 1 CD cycle
 * batchScope(() => {
 *   $.a.set(1);
 *   $.b.set(2);
 *   $.c.set(3);
 * });
 * ```
 */
export function batchScope(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
  }
}

/**
 * Check if currently inside a batch scope.
 */
export function isInBatchScope(): boolean {
  return batchDepth > 0;
}

/**
 * Get current batch depth (for testing/debugging).
 */
export function getBatchDepth(): number {
  return batchDepth;
}
