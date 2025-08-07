import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalStore, enhancedSignalStore } from '@signal-tree';

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
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold text-gray-800 mb-6">
        ⚡ Batching Performance Comparison
      </h1>

      <div class="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-center mb-2">
          <span class="text-blue-600 mr-2">💡</span>
          <h3 class="font-semibold text-blue-800">What This Demonstrates</h3>
        </div>
        <p class="text-blue-700 text-sm">
          This example shows the performance difference between normal signal
          updates and batched updates. Batching reduces the number of change
          notifications and re-renders when multiple updates happen in quick
          succession.
        </p>
      </div>

      <!-- Controls -->
      <div class="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          🎮 Test Controls
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label
              for="updateCount"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Number of Updates
            </label>
            <input
              id="updateCount"
              type="number"
              [(ngModel)]="updateCount"
              min="1"
              max="1000"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              for="delay"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Delay Between Updates (ms)
            </label>
            <input
              id="delay"
              type="number"
              [(ngModel)]="delay"
              min="0"
              max="100"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="flex items-end">
            <button
              (click)="runTest()"
              [disabled]="isRunning"
              class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {{ isRunning ? 'Running...' : 'Run Performance Test' }}
            </button>
          </div>
        </div>

        <div class="flex space-x-4">
          <button
            (click)="resetStores()"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Reset Stores
          </button>

          <button
            (click)="clearMetrics()"
            class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Clear Metrics
          </button>
        </div>
      </div>

      <!-- Side-by-Side Comparison -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Regular Store -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2
            class="text-xl font-semibold text-gray-800 mb-4 flex items-center"
          >
            🐌 Regular Store
            <span
              class="ml-2 text-sm bg-red-100 text-red-800 px-2 py-1 rounded"
            >
              No Batching
            </span>
          </h2>

          <div class="space-y-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Current Values</h3>
              <div class="space-y-2 text-sm">
                <div>
                  <strong>Counter:</strong>
                  <code class="bg-red-100 px-2 py-1 rounded">{{
                    regularStore.state.counter()
                  }}</code>
                </div>
                <div>
                  <strong>Text:</strong>
                  <code class="bg-red-100 px-2 py-1 rounded">{{
                    regularStore.state.text()
                  }}</code>
                </div>
                <div>
                  <strong>Flag:</strong>
                  <code class="bg-red-100 px-2 py-1 rounded">{{
                    regularStore.state.flag()
                  }}</code>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">
                Performance Metrics
              </h3>
              <div class="space-y-2 text-sm">
                <div>
                  <strong>Effect Runs:</strong>
                  <span class="text-red-600 font-mono">{{
                    regularMetrics().updates
                  }}</span>
                </div>
                <div>
                  <strong>Total Time:</strong>
                  <span class="text-red-600 font-mono"
                    >{{ regularMetrics().totalTime.toFixed(2) }}ms</span
                  >
                </div>
                <div>
                  <strong>Average Time:</strong>
                  <span class="text-red-600 font-mono"
                    >{{ regularMetrics().averageTime.toFixed(2) }}ms</span
                  >
                </div>
                <div>
                  <strong>Last Update:</strong>
                  <span class="text-red-600 font-mono"
                    >{{ regularMetrics().lastUpdate.toFixed(2) }}ms</span
                  >
                </div>
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Manual Controls</h3>
              <div class="flex space-x-2">
                <button
                  (click)="updateRegularStore()"
                  class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Update Store
                </button>
                <button
                  (click)="multiUpdateRegular()"
                  class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Multi Update
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Batched Store -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2
            class="text-xl font-semibold text-gray-800 mb-4 flex items-center"
          >
            🚀 Enhanced Store
            <span
              class="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded"
            >
              With Batching
            </span>
          </h2>

          <div class="space-y-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Current Values</h3>
              <div class="space-y-2 text-sm">
                <div>
                  <strong>Counter:</strong>
                  <code class="bg-green-100 px-2 py-1 rounded">{{
                    batchedStore.state.counter()
                  }}</code>
                </div>
                <div>
                  <strong>Text:</strong>
                  <code class="bg-green-100 px-2 py-1 rounded">{{
                    batchedStore.state.text()
                  }}</code>
                </div>
                <div>
                  <strong>Flag:</strong>
                  <code class="bg-green-100 px-2 py-1 rounded">{{
                    batchedStore.state.flag()
                  }}</code>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">
                Performance Metrics
              </h3>
              <div class="space-y-2 text-sm">
                <div>
                  <strong>Effect Runs:</strong>
                  <span class="text-green-600 font-mono">{{
                    batchedMetrics().updates
                  }}</span>
                </div>
                <div>
                  <strong>Total Time:</strong>
                  <span class="text-green-600 font-mono"
                    >{{ batchedMetrics().totalTime.toFixed(2) }}ms</span
                  >
                </div>
                <div>
                  <strong>Average Time:</strong>
                  <span class="text-green-600 font-mono"
                    >{{ batchedMetrics().averageTime.toFixed(2) }}ms</span
                  >
                </div>
                <div>
                  <strong>Last Update:</strong>
                  <span class="text-green-600 font-mono"
                    >{{ batchedMetrics().lastUpdate.toFixed(2) }}ms</span
                  >
                </div>
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Manual Controls</h3>
              <div class="flex space-x-2">
                <button
                  (click)="updateBatchedStore()"
                  class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Update Store
                </button>
                <button
                  (click)="multiBatchUpdate()"
                  class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Batch Update
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Comparison -->
      <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          📊 Performance Comparison
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="text-center p-4 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold text-blue-600 mb-2">
              {{ getImprovementPercentage() }}%
            </div>
            <div class="text-sm text-gray-600">Fewer Effect Runs</div>
          </div>

          <div class="text-center p-4 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600 mb-2">
              {{ getTimeImprovement() }}ms
            </div>
            <div class="text-sm text-gray-600">Time Saved</div>
          </div>

          <div class="text-center p-4 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold text-purple-600 mb-2">
              {{ getEfficiencyRatio() }}x
            </div>
            <div class="text-sm text-gray-600">Efficiency Gain</div>
          </div>
        </div>

        <div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex items-center mb-2">
            <span class="text-yellow-600 mr-2">⚠️</span>
            <h3 class="font-semibold text-yellow-800">Performance Notes</h3>
          </div>
          <ul class="text-yellow-700 text-sm space-y-1">
            <li>
              • Batching is most effective when multiple updates happen in rapid
              succession
            </li>
            <li>
              • The improvement depends on the complexity of your effects and
              computed values
            </li>
            <li>• With delay=0, you'll see the maximum benefit of batching</li>
            <li>
              • Real-world scenarios often have even more dramatic improvements
            </li>
          </ul>
        </div>
      </div>

      <!-- Code Examples -->
      <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          💻 Code Comparison
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 class="font-medium text-gray-800 mb-2">Regular Store</h3>
            <div
              class="bg-gray-800 text-gray-300 p-4 rounded-lg overflow-x-auto text-sm"
            >
              <pre><code>{{ regularStoreCode }}</code></pre>
            </div>
          </div>

          <div>
            <h3 class="font-medium text-gray-800 mb-2">
              Enhanced Store with Batching
            </h3>
            <div
              class="bg-gray-800 text-gray-300 p-4 rounded-lg overflow-x-auto text-sm"
            >
              <pre><code>{{ batchedStoreCode }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .container {
        max-width: 1200px;
      }

      code {
        font-family: 'Courier New', monospace;
      }
    `,
  ],
})
export class BatchingComparisonComponent implements OnDestroy {
  updateCount = 50;
  delay = 0;
  isRunning = false;

  // Regular store without batching
  regularStore = signalStore({
    counter: 0,
    text: 'Initial',
    flag: false,
  });

  // Enhanced store with batching
  batchedStore = enhancedSignalStore(
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
    // Effect for regular store
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastRegularUpdate;
      this.lastRegularUpdate = current;

      // Access store values to trigger effect
      this.regularStore.state.counter();
      this.regularStore.state.text();
      this.regularStore.state.flag();

      this.regularMetrics.update((metrics) => ({
        updates: metrics.updates + 1,
        totalTime: metrics.totalTime + updateTime,
        averageTime: (metrics.totalTime + updateTime) / (metrics.updates + 1),
        lastUpdate: updateTime,
      }));
    });

    // Effect for batched store
    effect(() => {
      const current = performance.now();
      const updateTime = current - this.lastBatchedUpdate;
      this.lastBatchedUpdate = current;

      // Access store values to trigger effect
      this.batchedStore.state.counter();
      this.batchedStore.state.text();
      this.batchedStore.state.flag();

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
    this.resetStores();
    this.clearMetrics();

    // Initialize timing
    this.lastRegularUpdate = performance.now();
    this.lastBatchedUpdate = performance.now();

    // Run updates on regular store
    for (let i = 0; i < this.updateCount; i++) {
      this.regularStore.state.counter.set(i);
      this.regularStore.state.text.set(`Update ${i}`);
      this.regularStore.state.flag.set(i % 2 === 0);

      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Run updates on batched store using batchUpdate
    if (this.batchedStore.batchUpdate) {
      for (let i = 0; i < this.updateCount; i++) {
        this.batchedStore.batchUpdate(() => ({
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

  resetStores() {
    this.regularStore.update(() => ({
      counter: 0,
      text: 'Initial',
      flag: false,
    }));

    this.batchedStore.update(() => ({
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

  updateRegularStore() {
    const current = this.regularStore.state.counter() + 1;
    this.regularStore.state.counter.set(current);
    this.regularStore.state.text.set(`Manual ${current}`);
    this.regularStore.state.flag.set(current % 2 === 0);
  }

  updateBatchedStore() {
    const current = this.batchedStore.state.counter() + 1;
    this.batchedStore.state.counter.set(current);
    this.batchedStore.state.text.set(`Manual ${current}`);
    this.batchedStore.state.flag.set(current % 2 === 0);
  }

  multiUpdateRegular() {
    // Multiple individual updates (will trigger effect multiple times)
    for (let i = 0; i < 5; i++) {
      const value = this.regularStore.state.counter() + 1;
      this.regularStore.state.counter.set(value);
      this.regularStore.state.text.set(`Multi ${value}`);
      this.regularStore.state.flag.set(value % 2 === 0);
    }
  }

  multiBatchUpdate() {
    // Multiple updates in a batch (will trigger effect once)
    if (this.batchedStore.batchUpdate) {
      for (let i = 0; i < 5; i++) {
        this.batchedStore.batchUpdate((current) => ({
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

  regularStoreCode = `// Regular store - no batching
const store = signalStore({
  counter: 0,
  text: 'Initial',
  flag: false
});

// Each update triggers effects immediately
for (let i = 0; i < 100; i++) {
  store.counter.set(i);        // Effect runs
  store.text.set(\`Update \${i}\`); // Effect runs
  store.flag.set(i % 2 === 0); // Effect runs
}
// Total: 300 effect runs`;

  batchedStoreCode = `// Enhanced store with batching
const store = enhancedSignalStore({
  counter: 0,
  text: 'Initial',
  flag: false
}, {
  enablePerformanceFeatures: true,
  batchUpdates: true
});

// Multiple updates batched together
for (let i = 0; i < 100; i++) {
  store.batchUpdate(() => ({
    counter: i,
    text: \`Update \${i}\`,
    flag: i % 2 === 0
  }));
}
// Total: ~100 effect runs (batched)`;
}
