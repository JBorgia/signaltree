import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signal-tree';

interface PerformanceMetrics {
  updates: number;
  totalTime: number;
  averageTime: number;
  lastUpdate: number;
}

@Component({
  selector: 'app-batching-comparison',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './batching-comparison.component.html',
  styleUrls: ['./batching-comparison.component.scss'],
})
export class BatchingComparisonComponent implements OnDestroy {
  updateCount = 50;
  delay = 0;
  isRunning = false;

  // Tree demonstrating individual updates
  individualTree = signalTree({
    counter: 0,
    text: 'Initial',
    flag: false,
  });

  // Tree showcasing smart progressive enhancement with auto-enabling batch updates
  smartTree = signalTree({
    counter: 0,
    text: 'Initial',
    flag: false,
  });

  // Performance metrics
  individualMetrics = signal<PerformanceMetrics>({
    updates: 0,
    totalTime: 0,
    averageTime: 0,
    lastUpdate: 0,
  });

  smartMetrics = signal<PerformanceMetrics>({
    updates: 0,
    totalTime: 0,
    averageTime: 0,
    lastUpdate: 0,
  });

  comparisonLog: Array<{
    timestamp: Date;
    test: string;
    individual: number;
    smart: number;
    improvement: string;
  }> = [];

  batchedMetrics = signal<PerformanceMetrics>({
    updates: 0,
    totalTime: 0,
    averageTime: 0,
    lastUpdate: 0,
  });

  private startTime = 0;
  private lastIndividualUpdate = 0;
  private lastSmartUpdate = 0;

  constructor() {
    this.setupEffects();
  }

  ngOnDestroy() {
    // Component cleanup - effects are automatically disposed
    this.isRunning = false;
  }

  private setupEffects() {
    // Effect for individual updates tree
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastIndividualUpdate;
      this.lastIndividualUpdate = current;

      // Access tree values to trigger effect
      this.individualTree.$.counter();
      this.individualTree.$.text();
      this.individualTree.$.flag();

      this.individualMetrics.update((metrics) => ({
        updates: metrics.updates + 1,
        totalTime: metrics.totalTime + updateTime,
        averageTime: (metrics.totalTime + updateTime) / (metrics.updates + 1),
        lastUpdate: updateTime,
      }));
    });

    // Effect for smart batching tree
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastSmartUpdate;
      this.lastSmartUpdate = current;

      // Access tree values to trigger effect
      this.smartTree.$.counter();
      this.smartTree.$.text();
      this.smartTree.$.flag();

      this.smartMetrics.update((metrics) => ({
        updates: metrics.updates + 1,
        totalTime: metrics.totalTime + updateTime,
        averageTime: (metrics.totalTime + updateTime) / (metrics.updates + 1),
        lastUpdate: updateTime,
      }));
    });

    // Effect for batched tree
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastBatchedUpdate;
      this.lastBatchedUpdate = current;

      // Access tree values to trigger effect
      this.batchedTree.state.counter();
      this.batchedTree.state.text();
      this.batchedTree.state.flag();

      this.batchedMetrics.update((metrics) => ({
        updates: metrics.updates + 1,
        totalTime: metrics.totalTime + updateTime,
        averageTime: (metrics.totalTime + updateTime) / (metrics.updates + 1),
        lastUpdate: updateTime,
      }));
    });
  }

  async runIndividualUpdatesTest() {
    this.isRunning = true;
    this.resetTrees();
    this.clearMetrics();

    // Initialize timing
    this.lastIndividualUpdate = performance.now();

    const startTime = performance.now();

    // Run individual updates - each triggers separate renders
    for (let i = 0; i < this.updateCount; i++) {
      this.individualTree.$.counter.set(i);
      this.individualTree.$.text.set(`Update ${i}`);
      this.individualTree.$.flag.set(i % 2 === 0);

      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }

    const individualTime = performance.now() - startTime;
    this.isRunning = false;
    return individualTime;
  }

  async runSmartBatchingTest() {
    this.isRunning = true;
    this.resetTrees();

    // Initialize timing
    this.lastSmartUpdate = performance.now();

    const startTime = performance.now();

    // Run smart batching - auto-enables on first use!
    for (let i = 0; i < Math.ceil(this.updateCount / 10); i++) {
      this.smartTree.batchUpdate(() => {
        for (let j = 0; j < 10 && (i * 10 + j) < this.updateCount; j++) {
          const index = i * 10 + j;
          this.smartTree.$.counter.set(index);
          this.smartTree.$.text.set(`Batch ${index}`);
          this.smartTree.$.flag.set(index % 2 === 0);
        }
      });

      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }

    const smartTime = performance.now() - startTime;
    this.isRunning = false;
    return smartTime;
  }

  async runComparisonTest() {
    this.isRunning = true;

    // Run individual updates test
    const individualTime = await this.runIndividualUpdatesTest();

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Run smart batching test
    const smartTime = await this.runSmartBatchingTest();

    // Calculate improvement
    const improvement = Math.round(((individualTime - smartTime) / individualTime) * 100);

    // Log comparison
    this.comparisonLog.unshift({
      timestamp: new Date(),
      test: `${this.updateCount} updates`,
      individual: Math.round(individualTime),
      smart: Math.round(smartTime),
      improvement: improvement > 0 ? `${improvement}% faster` : `${Math.abs(improvement)}% slower`
    });

    // Keep only last 10 entries
    if (this.comparisonLog.length > 10) {
      this.comparisonLog = this.comparisonLog.slice(0, 10);
    }

    this.isRunning = false;
  }

  resetTrees() {
    this.individualTree.update(() => ({
      counter: 0,
      text: 'Initial',
      flag: false,
    }));

    this.smartTree.update(() => ({
      counter: 0,
      text: 'Initial',
      flag: false,
    }));
  }

  clearMetrics() {
    this.individualMetrics.set({
      updates: 0,
      totalTime: 0,
      averageTime: 0,
      lastUpdate: 0,
    });

    this.smartMetrics.set({
      updates: 0,
      totalTime: 0,
      averageTime: 0,
      lastUpdate: 0,
    });
  }

  // Manual update methods for demonstration
  updateIndividualTree() {
    const current = this.individualTree.$.counter() + 1;
    this.individualTree.$.counter.set(current);
    this.individualTree.$.text.set(`Manual ${current}`);
    this.individualTree.$.flag.set(current % 2 === 0);
  }

  updateSmartTree() {
    const current = this.smartTree.$.counter() + 1;
    this.smartTree.$.counter.set(current);
    this.smartTree.$.text.set(`Manual ${current}`);
    this.smartTree.$.flag.set(current % 2 === 0);
  }

  // Demonstrate multiple individual updates
  multiUpdateIndividual() {
    // Multiple individual updates (will trigger effect multiple times)
    for (let i = 0; i < 5; i++) {
      const value = this.individualTree.$.counter() + 1;
      this.individualTree.$.counter.set(value);
      this.individualTree.$.text.set(`Multi ${value}`);
      this.individualTree.$.flag.set(value % 2 === 0);
    }
  }

  // Demonstrate smart batching (auto-enables!)
  multiUpdateSmart() {
    // Multiple updates in a batch - auto-enabling feature!
    this.smartTree.batchUpdate(() => {
      for (let i = 0; i < 5; i++) {
        const value = this.smartTree.$.counter() + i + 1;
        this.smartTree.$.counter.set(value);
        this.smartTree.$.text.set(`Smart Batch ${value}`);
        this.smartTree.$.flag.set(value % 2 === 0);
      }
    });
  }

  clearComparisonLog() {
    this.comparisonLog = [];
  }

  // Get metrics to show auto-enabled features
  getSmartTreeMetrics() {
    return this.smartTree.getMetrics();
  }

  getImprovementPercentage(): string {
    const individual = this.individualMetrics().updates;
    const smart = this.smartMetrics().updates;

    if (individual === 0 || smart === 0) return '0';

    const improvement = Math.round(((individual - smart) / individual) * 100);
    return improvement > 0 ? `+${improvement}` : `${improvement}`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  codeExample = `// Smart Progressive Enhancement Batching Demo

// Create trees - no configuration needed!
const individualTree = signalTree({ counter: 0, text: '', flag: false });
const smartTree = signalTree({ counter: 0, text: '', flag: false });

// Individual updates (multiple renders)
individualTree.$.counter.set(1);
individualTree.$.text.set('Update 1');
individualTree.$.flag.set(true);

// Smart batching auto-enables on first use!
smartTree.batchUpdate(() => {
  smartTree.$.counter.set(1);
  smartTree.$.text.set('Batch Update 1');
  smartTree.$.flag.set(true);
  // Only one render cycle for all updates!
});

// Performance automatically optimized - no config required!`;
}`;
}

    const improvement = ((regular - batched) / regular) * 100;
    return Math.max(0, improvement).toFixed(1);
  }

  getTimeImprovement(): string {
    const regular = this.regularMetrics().totalTime;
    const batched = this.batchedMetrics().totalTime;

    return Math.max(0, regular - batched).toFixed(2);
  }

  getEfficiencyRatio(): string {
    const regular = this.regularMetrics().updates;
    const batched = this.batchedMetrics().updates;

    if (batched === 0) return '∞';

