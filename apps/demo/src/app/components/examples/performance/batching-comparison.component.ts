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

  // Regular tree without batching
  regularTree = signalTree({
    counter: 0,
    text: 'Initial',
    flag: false,
  });

  // Enhanced tree with batching
  batchedTree = signalTree(
    {
      counter: 0,
      text: 'Initial',
      flag: false,
    },
    {
      enablePerformanceFeatures: true,
      batchUpdates: true,
    }
  );

  // Performance metrics
  regularMetrics = signal<PerformanceMetrics>({
    updates: 0,
    totalTime: 0,
    averageTime: 0,
    lastUpdate: 0,
  });

  batchedMetrics = signal<PerformanceMetrics>({
    updates: 0,
    totalTime: 0,
    averageTime: 0,
    lastUpdate: 0,
  });

  private startTime = 0;
  private lastRegularUpdate = 0;
  private lastBatchedUpdate = 0;

  constructor() {
    this.setupEffects();
  }

  ngOnDestroy() {
    // Component cleanup - effects are automatically disposed
    this.isRunning = false;
  }

  private setupEffects() {
    // Effect for regular tree
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastRegularUpdate;
      this.lastRegularUpdate = current;

      // Access tree values to trigger effect
      this.regularTree.state.counter();
      this.regularTree.state.text();
      this.regularTree.state.flag();

      this.regularMetrics.update((metrics) => ({
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

  async runTest() {
    this.isRunning = true;
    this.resetTrees();
    this.clearMetrics();

    // Initialize timing
    this.lastRegularUpdate = performance.now();
    this.lastBatchedUpdate = performance.now();

    // Run updates on regular tree
    for (let i = 0; i < this.updateCount; i++) {
      this.regularTree.state.counter.set(i);
      this.regularTree.state.text.set(`Update ${i}`);
      this.regularTree.state.flag.set(i % 2 === 0);

      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Run updates on batched tree using batchUpdate
    if (this.batchedTree.batchUpdate) {
      for (let i = 0; i < this.updateCount; i++) {
        this.batchedTree.batchUpdate(() => ({
          counter: i,
          text: `Update ${i}`,
          flag: i % 2 === 0,
        }));

        if (this.delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.delay));
        }
      }
    }

    this.isRunning = false;
  }

  resetTrees() {
    this.regularTree.update(() => ({
      counter: 0,
      text: 'Initial',
      flag: false,
    }));

    this.batchedTree.update(() => ({
      counter: 0,
      text: 'Initial',
      flag: false,
    }));
  }

  clearMetrics() {
    this.regularMetrics.set({
      updates: 0,
      totalTime: 0,
      averageTime: 0,
      lastUpdate: 0,
    });

    this.batchedMetrics.set({
      updates: 0,
      totalTime: 0,
      averageTime: 0,
      lastUpdate: 0,
    });
  }

  updateRegularTree() {
    const current = this.regularTree.state.counter() + 1;
    this.regularTree.state.counter.set(current);
    this.regularTree.state.text.set(`Manual ${current}`);
    this.regularTree.state.flag.set(current % 2 === 0);
  }

  updateBatchedTree() {
    const current = this.batchedTree.state.counter() + 1;
    this.batchedTree.state.counter.set(current);
    this.batchedTree.state.text.set(`Manual ${current}`);
    this.batchedTree.state.flag.set(current % 2 === 0);
  }

  multiUpdateRegular() {
    // Multiple individual updates (will trigger effect multiple times)
    for (let i = 0; i < 5; i++) {
      const value = this.regularTree.state.counter() + 1;
      this.regularTree.state.counter.set(value);
      this.regularTree.state.text.set(`Multi ${value}`);
      this.regularTree.state.flag.set(value % 2 === 0);
    }
  }

  multiBatchUpdate() {
    // Multiple updates in a batch (will trigger effect once)
    if (this.batchedTree.batchUpdate) {
      for (let i = 0; i < 5; i++) {
        this.batchedTree.batchUpdate((current) => ({
          counter: current.counter + 1,
          text: `Batch ${current.counter + 1}`,
          flag: (current.counter + 1) % 2 === 0,
        }));
      }
    }
  }

  getImprovementPercentage(): string {
    const regular = this.regularMetrics().updates;
    const batched = this.batchedMetrics().updates;

    if (regular === 0 || batched === 0) return '0';

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

    const ratio = regular / batched;
    return ratio.toFixed(1);
  }

  regularTreeCode = `// Regular tree - no batching
const tree = signalTree({
  counter: 0,
  text: 'Initial',
  flag: false
});

// Each update triggers effects immediately
for (let i = 0; i < 100; i++) {
  tree.counter.set(i);        // Effect runs
  tree.text.set(\`Update \${i}\`); // Effect runs
  tree.flag.set(i % 2 === 0); // Effect runs
}
// Total: 300 effect runs`;

  batchedTreeCode = `// Enhanced tree with batching
const tree = signalTree({
  counter: 0,
  text: 'Initial',
  flag: false
}, {
  enablePerformanceFeatures: true,
  batchUpdates: true
});

// Multiple updates batched together
for (let i = 0; i < 100; i++) {
  tree.batchUpdate(() => ({
    counter: i,
    text: \`Update \${i}\`,
    flag: i % 2 === 0
  }));
}
// Total: ~100 effect runs (batched)`;
}
