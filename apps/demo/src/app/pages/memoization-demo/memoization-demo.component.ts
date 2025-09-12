import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { memoizeReference, memoizeShallow } from '@signaltree/memoization';

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
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Memoization Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Input Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Controls</h2>

          <div class="space-y-4">
            <div>
              <label for="strategySelect" class="block text-sm font-medium mb-2"
                >Memoization Strategy:</label
              >
              <select
                id="strategySelect"
                [(ngModel)]="selectedStrategy"
                (ngModelChange)="onStrategyChange()"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="deep">Deep Equality (Default)</option>
                <option value="shallow">Shallow Equality (Fast)</option>
                <option value="reference">Reference Equality (Fastest)</option>
              </select>
              <p class="text-xs text-gray-600 mt-1">
                {{ getStrategyDescription() }}
              </p>
            </div>

            <div>
              <label
                for="multiplierInput"
                class="block text-sm font-medium mb-2"
                >Multiplier:</label
              >
              <input
                id="multiplierInput"
                type="number"
                [(ngModel)]="multiplier"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label
                for="searchTermInput"
                class="block text-sm font-medium mb-2"
                >Search Term:</label
              >
              <input
                id="searchTermInput"
                type="text"
                [(ngModel)]="searchTerm"
                placeholder="Filter numbers..."
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div class="flex space-x-2">
              <button
                (click)="addRandomNumbers()"
                class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Add Random Numbers
              </button>

              <button
                (click)="runPerformanceTest()"
                class="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
              >
                Performance Test
              </button>
            </div>

            <button
              (click)="clearMemoCache()"
              class="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Clear Memo Cache
            </button>
          </div>
        </div>

        <!-- Results -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Memoized Computations</h2>

          <div class="space-y-4">
            <div><strong>Current Strategy:</strong> {{ selectedStrategy }}</div>
            <div><strong>Compute Count:</strong> {{ computeCount() }}</div>
            <div><strong>Numbers Count:</strong> {{ numbers().length }}</div>

            <div>
              <strong>Filtered & Multiplied Sum:</strong>
              {{ expensiveComputation() }}
            </div>

            <div *ngIf="performanceResults.length > 0">
              <strong>Performance Test Results:</strong>
              <div class="bg-gray-100 p-3 rounded mt-2">
                <div
                  *ngFor="let result of performanceResults"
                  class="flex justify-between"
                >
                  <span>{{ result.strategy }}:</span>
                  <span>{{ result.duration.toFixed(2) }}ms</span>
                </div>
              </div>
            </div>

            <div>
              <strong>Cache Stats:</strong>
              <pre class="bg-gray-100 p-2 rounded text-sm mt-2">{{
                getCacheStats() | json
              }}</pre>
            </div>

            <div class="max-h-64 overflow-y-auto">
              <strong>Filtered Numbers:</strong>
              <div class="grid grid-cols-4 gap-2 mt-2">
                <span
                  *ngFor="let num of filteredNumbers()"
                  class="bg-blue-100 px-2 py-1 rounded text-sm"
                >
                  {{ num }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MemoizationDemoComponent {
  selectedStrategy: 'deep' | 'shallow' | 'reference' = 'deep';
  performanceResults: { strategy: string; duration: number }[] = [];

  private store = signalTree<MemoState>(
    {
      numbers: Array.from({ length: 100 }, () =>
        Math.floor(Math.random() * 1000)
      ),
      multiplier: 2,
      searchTerm: '',
      computeCount: 0,
      strategy: 'deep',
    },
    {
      useMemoization: true,
      treeName: 'MemoizationDemo',
    }
  );

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
    // Increment compute count to track how often this runs
    this.store.$.computeCount.set(state.computeCount + 1);

    const filtered = this.filteredNumbers();
    return this.computeFunction(filtered, state.multiplier);
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
}
