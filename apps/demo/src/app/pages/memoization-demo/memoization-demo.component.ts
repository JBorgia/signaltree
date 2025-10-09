import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { memoizeReference, memoizeShallow, withMemoization } from '@signaltree/memoization';

interface MemoState {
  numbers: number[];
  multiplier: number;
  searchTerm: string;
  computeCount: number;
  strategy: 'deep' | 'shallow' | 'reference';
}

@Component({
  selector: 'app-memoization-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './memoization-demo.component.html',
  styleUrls: ['./memoization-demo.component.scss'],
})
export class MemoizationDemoComponent {
  selectedStrategy: 'deep' | 'shallow' | 'reference' = 'deep';
  performanceResults: { strategy: string; duration: number }[] = [];

  // Comparison mode properties
  memoizedTime = 0;
  nonMemoizedTime = 0;
  nonMemoizedCount = 0;

  // Cache control properties
  maxCacheSize = 100;

  // Fibonacci properties
  fibInput = 10;
  fibResults: {
    result: number;
    memoizedTime: number;
    nonMemoizedTime: number;
    memoizedCalls: number;
    nonMemoizedCalls: number;
  } | null = null;

  store = signalTree<MemoState>({
    numbers: Array.from({ length: 100 }, () =>
      Math.floor(Math.random() * 1000)
    ),
    multiplier: 2,
    searchTerm: '',
    computeCount: 0,
    strategy: 'deep',
  }).with(withMemoization());

  // Current memoization functions based on strategy
  private filterFunction = memoizeShallow((numbers: number[], term: string) => {
    return numbers.filter((n) => n.toString().includes(term));
  });

  private computeFunction = memoizeShallow(
    (numbers: number[], multiplier: number) => {
      return numbers.map((n) => n * multiplier);
    }
  );

  // Computed properties
  numbers = this.store.$.numbers;
  multiplier = this.store.$.multiplier;
  searchTerm = this.store.$.searchTerm;
  computeCount = this.store.$.computeCount;

  // Memoized filtered numbers using current strategy
  filteredNumbers = this.store.memoize((state) => {
    return this.filterFunction(state.numbers, state.searchTerm);
  }, 'filteredNumbers');

  // Expensive memoized computation using current strategy
  expensiveComputation = this.store.memoize((state) => {
    // Track computation - increment happens via effect
    const filtered = this.filteredNumbers();
    const result = this.computeFunction(filtered, state.multiplier);

    // Schedule count increment outside the computed
    // Use update() to avoid reading the signal value inside the computed
    setTimeout(() => {
      this.store.$.computeCount.update((count) => count + 1);
    }, 0);

    return result;
  }, 'expensiveComputation');

  onStrategyChange() {
    // Update the memoization functions based on selected strategy
    switch (this.selectedStrategy) {
      case 'shallow':
        this.filterFunction = memoizeShallow(
          (numbers: number[], searchTerm: string) => {
            if (!searchTerm) return numbers;
            return numbers.filter((num) => num.toString().includes(searchTerm));
          }
        );
        this.computeFunction = memoizeShallow(
          (numbers: number[], multiplier: number) => {
            return numbers.map((num) => num * multiplier);
          }
        );
        break;
      case 'reference':
        this.filterFunction = memoizeReference(
          (numbers: number[], searchTerm: string) => {
            if (!searchTerm) return numbers;
            return numbers.filter((num) => num.toString().includes(searchTerm));
          }
        );
        this.computeFunction = memoizeReference(
          (numbers: number[], multiplier: number) => {
            return numbers.map((num) => num * multiplier);
          }
        );
        break;
      default: // deep
        // Use default memoization (deep equality)
        break;
    }

    this.store.$.strategy.set(this.selectedStrategy);
    this.clearMemoCache();
  }

  getStrategyDescription(): string {
    switch (this.selectedStrategy) {
      case 'deep':
        return 'Thorough equality check - slower but catches all changes';
      case 'shallow':
        return 'Check primitive properties only - good balance of speed/accuracy';
      case 'reference':
        return 'Fastest - only exact reference matches count as cache hits';
      default:
        return '';
    }
  }

  runPerformanceTest() {
    this.performanceResults = [];
    const strategies: Array<'deep' | 'shallow' | 'reference'> = [
      'deep',
      'shallow',
      'reference',
    ];

    strategies.forEach((strategy) => {
      this.selectedStrategy = strategy;
      this.onStrategyChange();

      const start = performance.now();

      // Run multiple computations to test performance
      for (let i = 0; i < 100; i++) {
        this.expensiveComputation();
        this.filteredNumbers();
      }

      const duration = performance.now() - start;
      this.performanceResults.push({ strategy, duration });
    });

    console.log('Performance Test Results:', this.performanceResults);
  }

  addRandomNumbers() {
    const newNumbers = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 1000)
    );
    this.store.$.numbers.update((current) => [...current, ...newNumbers]);
  }

  clearMemoCache() {
    this.store.clearCache();
  }

  getCacheStats() {
    return (
      this.store.getMetrics?.() || {
        cacheHits: 0,
        cacheMisses: 0,
        updates: 0,
        computations: 0,
        averageUpdateTime: 0,
      }
    );
  }

  getCacheHitRate(): number {
    const stats = this.getCacheStats();
    const total = stats.cacheHits + stats.cacheMisses;
    if (total === 0) return 0;
    return Math.round((stats.cacheHits / total) * 100);
  }

  getCacheEfficiencyColor(): string {
    const rate = this.getCacheHitRate();
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'info';
    if (rate >= 40) return 'warning';
    return 'danger';
  }

  // Memory estimation methods
  getEstimatedMemoryUsage(): string {
    const stats = this.getCacheStats();
    const cacheEntries = stats.cacheHits + stats.cacheMisses;

    // Estimate: each cache entry ≈ 500 bytes (rough estimate for array + metadata)
    const estimatedBytes = cacheEntries * 500;
    const estimatedKB = estimatedBytes / 1024;

    if (estimatedKB < 1) return estimatedKB.toFixed(2);
    if (estimatedKB < 1000) return estimatedKB.toFixed(1);
    return (estimatedKB / 1024).toFixed(2) + ' MB';
  }

  getCacheUsagePercentage(): number {
    const stats = this.getCacheStats();
    const cacheEntries = stats.cacheHits + stats.cacheMisses;
    if (this.maxCacheSize === 0) return 0;
    return Math.min(100, Math.round((cacheEntries / this.maxCacheSize) * 100));
  }

  getStrategyBadgeClass(strategy: string): string {
    switch (strategy) {
      case 'deep':
        return 'badge-purple';
      case 'shallow':
        return 'badge-blue';
      case 'reference':
        return 'badge-green';
      default:
        return 'badge-gray';
    }
  }

  // Comparison mode methods
  runComparison() {
    const iterations = 1000;
    const nums = this.numbers();
    const mult = this.multiplier();

    // Test memoized version
    const memoizedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.expensiveComputation();
    }
    this.memoizedTime = performance.now() - memoizedStart;

    // Test non-memoized version
    this.nonMemoizedCount = 0;
    const nonMemoizedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.nonMemoizedCount++;
      nums.map((n) => n * mult);
    }
    this.nonMemoizedTime = performance.now() - nonMemoizedStart;
  }

  getMemoizedPercentage(): number {
    const max = Math.max(this.memoizedTime, this.nonMemoizedTime);
    if (max === 0) return 0;
    return (this.memoizedTime / max) * 100;
  }

  getNonMemoizedPercentage(): number {
    const max = Math.max(this.memoizedTime, this.nonMemoizedTime);
    if (max === 0) return 0;
    return (this.nonMemoizedTime / max) * 100;
  }

  getSpeedup(): string {
    if (this.memoizedTime === 0) return '0.00';
    return (this.nonMemoizedTime / this.memoizedTime).toFixed(2);
  }

  // Fibonacci calculation methods
  calculateFibonacci() {
    if (this.fibInput < 0 || this.fibInput > 40) return;

    const n = this.fibInput;

    // Memoized version
    const memoCache = new Map<number, number>();
    let memoizedCalls = 0;

    const fibMemoized = (num: number): number => {
      memoizedCalls++;
      if (num <= 1) return num;

      const cached = memoCache.get(num);
      if (cached !== undefined) return cached;

      const result = fibMemoized(num - 1) + fibMemoized(num - 2);
      memoCache.set(num, result);
      return result;
    };

    const memoStart = performance.now();
    const memoResult = fibMemoized(n);
    const memoTime = performance.now() - memoStart;

    // Non-memoized version
    let nonMemoizedCalls = 0;

    const fibNonMemoized = (num: number): number => {
      nonMemoizedCalls++;
      if (num <= 1) return num;
      return fibNonMemoized(num - 1) + fibNonMemoized(num - 2);
    };

    const nonMemoStart = performance.now();
    fibNonMemoized(n); // Run for timing, result should match memoResult
    const nonMemoTime = performance.now() - nonMemoStart;

    this.fibResults = {
      result: memoResult,
      memoizedTime: memoTime,
      nonMemoizedTime: nonMemoTime,
      memoizedCalls: memoizedCalls,
      nonMemoizedCalls: nonMemoizedCalls,
    };
  }
}
