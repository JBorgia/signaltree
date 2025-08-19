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

// Simple reentrancy protection for write-loop detection (dev only)
let currentDispatchDepth = 0;
let maxDepthObserved = 0;
const MAX_SAFE_DEPTH = 1000; // heuristic; adjustable later

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
      currentDispatchDepth++;
      if (currentDispatchDepth > maxDepthObserved)
        maxDepthObserved = currentDispatchDepth;
      const g: unknown = globalThis;
      const env =
        typeof g === 'object' && g && 'process' in g
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((g as any).process?.env?.NODE_ENV as string | undefined)
          : undefined;
      if (currentDispatchDepth > MAX_SAFE_DEPTH && env !== 'production') {
        console.warn(
          '[SignalTree Scheduler] potential write loop detected (depth>',
          currentDispatchDepth,
          ')'
        );
      }
      t();
    } catch (err) {
      // Fail soft; future: optional error channel
      console.error('[SignalTree Scheduler] task error', err);
    }
    currentDispatchDepth--;
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
  stats: () => ({ maxDepthObserved }),
};

// untracked simply executes the function now; placeholder for future engine-specific untracked semantics
export function untracked<T>(fn: () => T): T {
  return fn();
}
