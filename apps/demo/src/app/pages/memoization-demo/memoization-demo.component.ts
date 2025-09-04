import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

interface MemoState {
  numbers: number[];
  multiplier: number;
  searchTerm: string;
  computeCount: number;
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

            <button
              (click)="addRandomNumbers()"
              class="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Add Random Numbers
            </button>

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
            <div><strong>Compute Count:</strong> {{ computeCount() }}</div>

            <div><strong>Numbers Count:</strong> {{ numbers().length }}</div>

            <div>
              <strong>Filtered & Multiplied Sum:</strong>
              {{ expensiveComputation() }}
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
  private store = signalTree<MemoState>(
    {
      numbers: Array.from({ length: 100 }, () =>
        Math.floor(Math.random() * 1000)
      ),
      multiplier: 2,
      searchTerm: '',
      computeCount: 0,
    },
    {
      useMemoization: true,
      treeName: 'MemoizationDemo',
    }
  );

  // Computed properties
  numbers = this.store.$.numbers;
  multiplier = this.store.$.multiplier;
  searchTerm = this.store.$.searchTerm;
  computeCount = this.store.$.computeCount;

  // Memoized filtered numbers
  filteredNumbers = this.store.memoize((state) => {
    if (!state.searchTerm) return state.numbers;
    return state.numbers.filter((num) =>
      num.toString().includes(state.searchTerm)
    );
  }, 'filteredNumbers');

  // Expensive memoized computation
  expensiveComputation = this.store.memoize((state) => {
    // Increment compute count to track how often this runs
    this.store.$.computeCount.set(state.computeCount + 1);

    // Simulate expensive computation
    const filtered = this.filteredNumbers();
    return filtered.reduce((sum, num) => sum + num * state.multiplier, 0);
  }, 'expensiveComputation');

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
