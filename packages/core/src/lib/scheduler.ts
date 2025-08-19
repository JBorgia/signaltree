/**
 * Minimal internal scheduler (Phase 2)
 *
 * Purpose: Provide a framework-agnostic, microtask-based batching primitive
 * that higher-level features (batchUpdate, future memo/effect scheduling) can use.
 *
 * Design constraints:
 *  - Zero external dependencies
 *  - Microtask flush (queueMicrotask) for low latency
 *  - Stable order (FIFO insertion order)
 *  - Single flush per microtask tick no matter how many tasks are scheduled
 *  - Tiny footprint (so it doesn't meaningfully impact bundle size)
 */

type Task = () => void;

let queue: Task[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  if (queue.length === 0) return;
  const tasks = queue;
  queue = [];
  // Execute sequentially; errors in one task should not block the rest
  for (const t of tasks) {
    try {
      t();
    } catch (err) {
      // Fail soft; future: optional error channel
      console.error('[SignalTree Scheduler] task error', err);
    }
  }
}

export function scheduleTask(fn: Task): void {
  queue.push(fn);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

// Exposed for tests / diagnostics (not part of public documented API yet)
export const __scheduler__ = {
  flush,
  pending: () => queue.length,
};
