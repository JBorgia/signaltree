import { CommonModule } from '@angular/common';
import { Component, computed, effect } from '@angular/core';
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

  // Track previous values using a memoization cache
  private cache = new Map<string, { result: number; timestamp: number }>();

  // Expensive computation (simulated) - READ ONLY, no signal writes
  expensiveResult = computed(() => {
    const input = this.inputValue();
    const mult = this.multiplier();
    const cacheKey = `${input}-${mult}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Return cached value if it exists and is fresh (within 5 seconds)
    if (cached && now - cached.timestamp < 5000) {
      return cached.result;
    }

    // Perform expensive computation
    let sum = 0;
    for (let i = 0; i < 10000000; i++) {
      sum += Math.sqrt(i);
    }
    const result = input * mult + sum * 0;

    // Store in cache
    this.cache.set(cacheKey, { result, timestamp: now });

    // Return the result (logging will be handled by effect)
    return result;
  });

  // Use effect to track computations and log them
  constructor() {
    let lastInput: number | null = null;
    let lastMultiplier: number | null = null;
    let lastResult: number | null = null;

    effect(() => {
      const input = this.inputValue();
      const mult = this.multiplier();
      const result = this.expensiveResult();

      // Detect if this is the same computation (cache hit)
      const isCached =
        lastInput === input && lastMultiplier === mult && lastResult === result;

      if (isCached) {
        this.tree.$.cacheHitCount.update((c) => c + 1);
      } else {
        this.tree.$.computationCount.update((c) => c + 1);
      }

      // Log the computation
      this.addLog({
        type: 'Expensive Computation',
        input: `input=${input}, multiplier=${mult}`,
        output: result.toString(),
        cached: isCached,
        duration: 0.1, // Approximate since we can't track in effect
      });

      // Update last values
      lastInput = input;
      lastMultiplier = mult;
      lastResult = result;
    });
  }

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
    this.cache.clear();
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
