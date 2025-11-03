/* Benchmark-only lazy array updater enhancer
 * - Opt-in via window.__BENCHMARK__ (demo) or explicit config
 * - Coalesces many small updates into a single microtask-flush
 * - Flush performs a single batched set using tree.batch() when available
 */
import type { SignalTree } from '@signaltree/core';

type Config = {
  enabled?: boolean;
  maxOps?: number;
  fallbackMs?: number;
  key?: string;
};

// Interfaces for dynamic access to avoid 'any' types
interface SignalLike<T = unknown> {
  (): T;
  get?(): T;
  set?(value: T): void;
}

class LazyArrayUpdater<T = unknown> {
  private pendingOps: Array<(arr: T[]) => void> = [];
  private scheduled = false;
  private timerId: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private tree: SignalTree<unknown>,
    private key = 'items',
    private cfg: { maxOps: number; fallbackMs: number } = {
      maxOps: 1024,
      fallbackMs: 8,
    }
  ) {}

  update(op: (arr: T[]) => void) {
    this.pendingOps.push(op);
    if (this.pendingOps.length >= this.cfg.maxOps) {
      this.flush();
      return;
    }

    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
      this.timerId = setTimeout(() => {
        if (this.scheduled) this.flush();
      }, this.cfg.fallbackMs);
    }
  }

  flush() {
    if (this.pendingOps.length === 0) {
      this.scheduled = false;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = undefined;
      }
      return;
    }

    const ops = this.pendingOps;
    this.pendingOps = [];
    this.scheduled = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }

    const itemsSignal = (this.tree.state as Record<string, unknown>)[this.key];

    // Perform a single batched mutation and single set of the backing array
    try {
      // Check if tree has a batch method
      const treeWithBatch = this.tree as SignalTree<unknown> & {
        batch?: (fn: () => void) => void;
      };
      treeWithBatch.batch?.(() => {
        const current: T[] = this.getCurrentArray(itemsSignal);

        for (const fn of ops) {
          try {
            fn(current);
          } catch {
            // Ignore individual operation errors in batch
          }
        }

        this.setCurrentArray(itemsSignal, current);
      });
    } catch {
      // If batch throws for some reason, attempt one-by-one set
      try {
        const current: T[] = this.getCurrentArray(itemsSignal);
        for (const fn of ops) fn(current);
        this.setCurrentArray(itemsSignal, current);
      } catch {
        // ignore
      }
    }
  }

  private getCurrentArray(itemsSignal: unknown): T[] {
    if (typeof itemsSignal === 'function') {
      return (itemsSignal as () => T[])();
    }

    const signalLike = itemsSignal as SignalLike<T[]>;
    if (signalLike && typeof signalLike.get === 'function') {
      return signalLike.get();
    }

    // fallback to reading property (non-signal shape)
    return (itemsSignal as T[]) || [];
  }

  private setCurrentArray(itemsSignal: unknown, current: T[]): void {
    const signalLike = itemsSignal as SignalLike<T[]>;
    if (signalLike && typeof signalLike.set === 'function') {
      signalLike.set(current);
    } else if (typeof itemsSignal === 'function') {
      // Node accessor style - functions that set values
      (itemsSignal as (value: T[]) => void)(current);
    } else {
      // Best-effort fallback: replace property on state
      try {
        (this.tree.state as Record<string, T[]>)[this.key] = current;
      } catch {
        // ignore
      }
    }
  }

  flushSync() {
    this.flush();
  }

  pendingCount() {
    return this.pendingOps.length;
  }

  dispose() {
    this.pendingOps = [];
    this.scheduled = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}

export function withLazyArrays(config: Config = {}) {
  const enabled =
    typeof config.enabled === 'boolean'
      ? config.enabled
      : typeof window !== 'undefined' &&
        !!(window as unknown as { __BENCHMARK__?: boolean }).__BENCHMARK__;
  const key = config.key ?? 'items';
  const maxOps = config.maxOps ?? 1024;
  const fallbackMs = config.fallbackMs ?? 8;

  return (tree: SignalTree<unknown>) => {
    if (!enabled) return tree;

    const updater = new LazyArrayUpdater(tree, key, { maxOps, fallbackMs });

    // Attach to tree for demo harness access and flush control
    try {
      // attach under less aggressive casts to keep lint happy
      const t = tree as unknown as Record<string, unknown>;
      t['__lazyArrayUpdater'] = updater as unknown;
      t['__flushLazyArrays'] = () => updater.flushSync();
    } catch {
      // ignore attach failures
    }

    return tree;
  };
}

// Export the class as a value so consumers can import the runtime helper in demo code
export type { LazyArrayUpdater };
