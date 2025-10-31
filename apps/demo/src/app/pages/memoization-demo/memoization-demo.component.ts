import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withMemoization } from '@signaltree/core';

interface ComputationLog {
  id: number;
  timestamp: number;
  type: string;
  input: string;
  output: string;
  cached: boolean;
  duration: number;
}

interface MemoState {
  inputValue: number;
  multiplier: number;
  logs: ComputationLog[];
  computationCount: number;
  cacheHitCount: number;
}

@Component({
  selector: 'app-memoization-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './memoization-demo.component.html',
  styleUrls: ['./memoization-demo.component.scss'],
})
export class MemoizationDemoComponent {
  private tree = signalTree<MemoState>({
    inputValue: 5,
    multiplier: 2,
    logs: [],
    computationCount: 0,
    cacheHitCount: 0,
  }).with(
    withMemoization({
      enabled: true,
      maxCacheSize: 100,
      equality: 'shallow',
      enableLRU: false,
    })
  );

  // State signals
  inputValue = this.tree.$.inputValue;
  multiplier = this.tree.$.multiplier;
  logs = this.tree.$.logs;
  computationCount = this.tree.$.computationCount;
  cacheHitCount = this.tree.$.cacheHitCount;

  // Track previous values to detect cache hits
  private previousInput = signal<number | null>(null);
  private previousMultiplier = signal<number | null>(null);
  private previousResult = signal<number | null>(null);

  // Expensive computation (simulated)
  expensiveResult = computed(() => {
    const input = this.inputValue();
    const mult = this.multiplier();
    const startTime = performance.now();

    // Check if we can use cached value
    const isCached =
      this.previousInput() === input &&
      this.previousMultiplier() === mult &&
      this.previousResult() !== null;

    let result: number;
    if (isCached) {
      // Use cached result
      result = this.previousResult() ?? 0;
      this.tree.$.cacheHitCount.set(this.cacheHitCount() + 1);
    } else {
      // Simulate expensive computation
      let sum = 0;
      for (let i = 0; i < 10000000; i++) {
        sum += Math.sqrt(i);
      }
      result = input * mult + sum * 0; // Use sum to prevent optimization
      this.tree.$.computationCount.set(this.computationCount() + 1);

      // Cache the values
      this.previousInput.set(input);
      this.previousMultiplier.set(mult);
      this.previousResult.set(result);
    }

    const duration = performance.now() - startTime;

    // Log the computation
    this.addLog({
      type: 'Expensive Computation',
      input: `input=${input}, multiplier=${mult}`,
      output: result.toString(),
      cached: isCached,
      duration,
    });

    return result;
  });

  // Simple computed (always recalculates)
  simpleResult = computed(() => {
    const input = this.inputValue();
    const mult = this.multiplier();
    return input * mult;
  });

  // Statistics
  cacheHitRate = computed(() => {
    const total = this.computationCount() + this.cacheHitCount();
    return total === 0 ? 0 : (this.cacheHitCount() / total) * 100;
  });

  totalComputations = computed(
    () => this.computationCount() + this.cacheHitCount()
  );

  averageDuration = computed(() => {
    const recentLogs = this.logs().slice(-10);
    if (recentLogs.length === 0) return 0;
    const sum = recentLogs.reduce((acc, log) => acc + log.duration, 0);
    return sum / recentLogs.length;
  });

  // Actions
  updateInput(value: number) {
    this.tree.$.inputValue.set(value);
  }

  updateMultiplier(value: number) {
    this.tree.$.multiplier.set(value);
  }

  triggerRecompute() {
    // Force a recompute by changing and reverting
    const current = this.inputValue();
    this.tree.$.inputValue.set(current + 1);
    setTimeout(() => {
      this.tree.$.inputValue.set(current);
    }, 100);
  }

  clearCache() {
    this.previousInput.set(null);
    this.previousMultiplier.set(null);
    this.previousResult.set(null);
  }

  clearLogs() {
    this.tree.$.logs.set([]);
  }

  resetStats() {
    this.tree.$.computationCount.set(0);
    this.tree.$.cacheHitCount.set(0);
    this.clearLogs();
    this.clearCache();
  }

  private addLog(log: Omit<ComputationLog, 'id' | 'timestamp'>) {
    const newLog: ComputationLog = {
      ...log,
      id: Date.now(),
      timestamp: Date.now(),
    };
    this.tree.$.logs.set([newLog, ...this.logs()].slice(0, 50));
  }

  formatDuration(ms: number): string {
    if (ms < 1) return `${ms.toFixed(3)}ms`;
    return `${ms.toFixed(2)}ms`;
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  // Expose Math for template
  Math = Math;
}
