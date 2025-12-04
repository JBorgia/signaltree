import { Injectable } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/core/enhancers/batching';
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
  private tree = signalTree<DemoAppState>(
    {
      counter: {
        count: 0,
        incrementedCount: 0,
      },
      benchmark: {
        isRunning: false,
        progress: 0,
        results: {},
      },
      ui: {
        currentTab: 'getting-started',
        sidebarOpen: false,
      },
    },
    // Use guardrails in development to catch performance issues and anti-patterns
    withGuardrails({
      detectMemoryLeaks: true,
      detectUnusedState: true,
      maxUpdateFrequency: 100, // Warn if updating more than 100x per second
      warnOnDeepNesting: 5,
      enforceImmutability: true,
    }),
    // Use batching for multiple concurrent updates
    withBatching()
  );

  // Expose state slices as public signals
  readonly counter = this.tree.counter;
  readonly benchmark = this.tree.benchmark;
  readonly ui = this.tree.ui;

  // Counter actions
  increment() {
    this.tree.counter.count.update((c) => c + 1);
  }

  decrement() {
    this.tree.counter.count.update((c) => c - 1);
  }

  reset() {
    this.tree.counter.count.set(0);
  }

  // Batch multiple counter updates to reduce change detection cycles
  addThenIncrement(amount: number) {
    this.tree.batch(() => {
      this.tree.counter.count.update((c) => c + amount);
      this.tree.counter.incrementedCount.update((c) => c + 1);
    });
  }

  // Benchmark actions
  setBenchmarkRunning(isRunning: boolean) {
    this.tree.benchmark.isRunning.set(isRunning);
  }

  setBenchmarkProgress(progress: number) {
    this.tree.benchmark.progress.set(progress);
  }

  setBenchmarkResults(results: Record<string, number>) {
    this.tree.benchmark.results.set(results);
  }

  // UI actions
  setCurrentTab(tab: string) {
    this.tree.ui.currentTab.set(tab);
  }

  toggleSidebar() {
    this.tree.ui.sidebarOpen.update((open) => !open);
  }
}
