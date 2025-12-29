import { Injectable } from '@angular/core';
import { signalTree, withBatching } from '@signaltree/core';
import { withGuardrails } from '@signaltree/guardrails';

/**
 * Demo Application Store - Single source of truth for app-wide state
 *
 * This demonstrates best practices for SignalTree usage:
 * - Single application-wide store (recommended pattern)
 * - Guardrails in development to catch anti-patterns
 * - Batching for multiple updates to reduce change detection cycles
 * - Encapsulated state with public API methods
 */

export interface DemoAppState {
  counter: {
    count: number;
    incrementedCount: number;
  };
  benchmark: {
    isRunning: boolean;
    progress: number;
    results: Record<string, number>;
  };
  ui: {
    currentTab: string;
    sidebarOpen: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class DemoAppStore {
  readonly tree = signalTree({
    counter: {
      count: 0,
      incrementedCount: 0,
    },
    benchmark: {
      isRunning: false,
      progress: 0,
      results: {} as Record<string, number>,
    },
    ui: {
      currentTab: 'getting-started' as string,
      sidebarOpen: false as boolean,
    },
  })
    .with(withBatching())
    .with(
      withGuardrails({
        mode: 'warn',
        budgets: {
          maxUpdateTime: 16,
        },
      })
    );

  // Expose state slices as public signals
  readonly counter = this.tree.$.counter;
  readonly benchmark = this.tree.$.benchmark;
  readonly ui = this.tree.$.ui;

  // Counter actions
  increment() {
    this.tree.$.counter.count.update((c: number) => c + 1);
  }

  decrement() {
    this.tree.$.counter.count.update((c: number) => c - 1);
  }

  reset() {
    this.tree.$.counter.count.set(0);
  }

  // Batch multiple counter updates to reduce change detection cycles
  addThenIncrement(amount: number) {
    this.tree.batch(() => {
      this.tree.$.counter.count.update((c: number) => c + amount);
      this.tree.$.counter.incrementedCount.update((c: number) => c + 1);
    });
  }

  // Benchmark actions
  setBenchmarkRunning(isRunning: boolean) {
    this.tree.$.benchmark.isRunning.set(isRunning);
  }

  setBenchmarkProgress(progress: number) {
    this.tree.$.benchmark.progress.set(progress);
  }

  setBenchmarkResults(results: Record<string, number>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.tree.$.benchmark['results'] as any).set(results);
  }

  // UI actions
  setCurrentTab(tab: string) {
    this.tree.$.ui.currentTab.set(tab);
  }

  toggleSidebar() {
    this.tree.$.ui.sidebarOpen.update((open: boolean) => !open);
  }
}
