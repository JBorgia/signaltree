import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { Todo, generateTodos } from '../../shared/models';

interface BenchmarkResult {
  library: string;
  operation: string;
  time: number;
  iterations: number;
  avgTime: number;
}

interface TestState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
}

@Component({
  selector: 'app-performance-comparison',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">Performance Comparison</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Benchmark Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Benchmark Configuration</h2>

          <div class="space-y-4">
            <div>
              <label
                for="datasetSize"
                class="block text-sm font-medium text-gray-700 mb-2"
              >
                Dataset Size
              </label>
              <select
                id="datasetSize"
                [(ngModel)]="datasetSize"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option [value]="100">100 items</option>
                <option [value]="500">500 items</option>
                <option [value]="1000">1,000 items</option>
                <option [value]="5000">5,000 items</option>
                <option [value]="10000">10,000 items</option>
              </select>
            </div>

            <div>
              <label
                for="iterations"
                class="block text-sm font-medium text-gray-700 mb-2"
              >
                Iterations
              </label>
              <select
                id="iterations"
                [(ngModel)]="iterations"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option [value]="10">10 iterations</option>
                <option [value]="50">50 iterations</option>
                <option [value]="100">100 iterations</option>
                <option [value]="500">500 iterations</option>
              </select>
            </div>

            <div>
              <h3 class="text-sm font-medium text-gray-700 mb-2">
                Test Operations
              </h3>
              <div class="space-y-2">
                <label *ngFor="let op of operations" class="flex items-center">
                  <input
                    type="checkbox"
                    [(ngModel)]="op.enabled"
                    class="mr-2"
                  />
                  <span class="text-sm">{{ op.name }}</span>
                </label>
              </div>
            </div>

            <button
              (click)="runBenchmarks()"
              [disabled]="isRunning"
              class="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isRunning ? 'Running...' : 'Run Benchmarks' }}
            </button>

            <button
              (click)="clearResults()"
              [disabled]="results().length === 0"
              class="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Results
            </button>
          </div>
        </div>

        <!-- Live Performance -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Live Performance Demo</h2>

          <div class="space-y-4">
            <div>
              <label
                for="liveDataSize"
                class="block text-sm font-medium text-gray-700 mb-2"
              >
                Live Dataset Size: {{ liveDataSize }}
              </label>
              <input
                id="liveDataSize"
                type="range"
                [(ngModel)]="liveDataSize"
                min="100"
                max="10000"
                step="100"
                class="w-full"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <button
                (click)="initializeLiveData()"
                class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Initialize Data
              </button>
              <button
                (click)="performRandomUpdates()"
                [disabled]="!liveDataInitialized"
                class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
              >
                Random Updates (×100)
              </button>
            </div>

            <div class="bg-gray-50 p-4 rounded">
              <h3 class="font-medium mb-2">Live Stats</h3>
              <div class="text-sm space-y-1">
                <div>
                  <strong>SignalTree Items:</strong> {{ signalTreeCount() }}
                </div>
                <div><strong>Native Items:</strong> {{ nativeCount() }}</div>
                <div>
                  <strong>Last Operation Time:</strong>
                  {{ lastOperationTime }}ms
                </div>
                <div>
                  <strong>Operations Performed:</strong>
                  {{ operationsPerformed }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Results Table -->
      <div
        class="mt-8 bg-white rounded-lg shadow p-6"
        *ngIf="results().length > 0"
      >
        <h2 class="text-xl font-semibold mb-4">Benchmark Results</h2>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Library
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Operation
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Total Time (ms)
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Avg Time (ms)
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Iterations
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Performance
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr *ngFor="let result of results()">
                <td
                  class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
                >
                  {{ result.library }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ result.operation }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ result.time.toFixed(3) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ result.avgTime.toFixed(3) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ result.iterations }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                      <div
                        class="h-2 rounded-full"
                        [class]="getPerformanceBarClass(result)"
                        [style.width.%]="getPerformanceWidth(result)"
                      ></div>
                    </div>
                    <span class="text-xs text-gray-500">
                      {{ getPerformanceRating(result) }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Performance Analysis -->
      <div class="mt-8 bg-blue-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Performance Analysis</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 class="font-medium text-blue-800 mb-2">SignalTree</h3>
            <p class="text-sm text-blue-700">
              Optimized for fine-grained reactivity with structural sharing and
              minimal re-computation. Best performance on selective updates and
              complex computed values.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-blue-800 mb-2">NgRx Signals</h3>
            <p class="text-sm text-blue-700">
              Built on Angular signals with normalized state patterns. Good
              performance with proper setup, but more overhead for simple
              operations.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-blue-800 mb-2">Native Signals</h3>
            <p class="text-sm text-blue-700">
              Minimal overhead but requires manual optimization. Fast for simple
              operations but can become inefficient with complex state
              relationships.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PerformanceComparisonComponent {
  // Configuration
  datasetSize = 1000;
  iterations = 100;
  liveDataSize = 1000;
  liveDataInitialized = false;

  operations = [
    { name: 'Initialize State', key: 'init', enabled: true },
    { name: 'Add Items', key: 'add', enabled: true },
    { name: 'Update Items', key: 'update', enabled: true },
    { name: 'Filter Items', key: 'filter', enabled: true },
    { name: 'Complex Query', key: 'query', enabled: true },
  ];

  // State
  isRunning = false;
  results = signal<BenchmarkResult[]>([]);
  lastOperationTime = 0;
  operationsPerformed = 0;

  // Test stores
  private signalTreeStore = signalTree<TestState>({
    todos: [],
    filter: 'all',
  });

  private nativeStore = {
    todos: signal<Todo[]>([]),
    filter: signal<'all' | 'active' | 'completed'>('all'),
  };

  // Live computed values
  signalTreeCount = computed(() => this.signalTreeStore.$.todos().length);
  nativeCount = computed(() => this.nativeStore.todos().length);

  async runBenchmarks() {
    this.isRunning = true;
    const newResults: BenchmarkResult[] = [];
    const testData = generateTodos(this.datasetSize);

    try {
      const enabledOps = this.operations.filter((op) => op.enabled);

      for (const operation of enabledOps) {
        // Test SignalTree
        const stResult = await this.benchmarkSignalTree(
          operation.key,
          testData
        );
        newResults.push({
          library: 'SignalTree',
          operation: operation.name,
          time: stResult,
          iterations: this.iterations,
          avgTime: stResult / this.iterations,
        });

        // Test Native Signals
        const nativeResult = await this.benchmarkNativeSignals(
          operation.key,
          testData
        );
        newResults.push({
          library: 'Native Signals',
          operation: operation.name,
          time: nativeResult,
          iterations: this.iterations,
          avgTime: nativeResult / this.iterations,
        });
      }

      this.results.set([...this.results(), ...newResults]);
    } finally {
      this.isRunning = false;
    }
  }

  private async benchmarkSignalTree(
    operation: string,
    testData: Todo[]
  ): Promise<number> {
    const startTime = performance.now();

    for (let i = 0; i < this.iterations; i++) {
      switch (operation) {
        case 'init':
          this.signalTreeStore.$.todos.set([]);
          break;
        case 'add':
          this.signalTreeStore.$.todos.set(testData.slice(0, 100));
          break;
        case 'update':
          this.signalTreeStore.$.todos.update((todos) =>
            todos.map((todo) => ({ ...todo, completed: !todo.completed }))
          );
          break;
        case 'filter':
          this.signalTreeStore.$.filter.set(
            i % 2 === 0 ? 'active' : 'completed'
          );
          break;
        case 'query': {
          // Trigger computed value
          const filtered = this.signalTreeStore.$.todos().filter(
            (t) =>
              this.signalTreeStore.$.filter() === 'all' ||
              (this.signalTreeStore.$.filter() === 'active' && !t.completed) ||
              (this.signalTreeStore.$.filter() === 'completed' && t.completed)
          );
          void filtered.length; // Use the result
          break;
        }
      }
    }

    return performance.now() - startTime;
  }

  private async benchmarkNativeSignals(
    operation: string,
    testData: Todo[]
  ): Promise<number> {
    const startTime = performance.now();

    for (let i = 0; i < this.iterations; i++) {
      switch (operation) {
        case 'init':
          this.nativeStore.todos.set([]);
          break;
        case 'add':
          this.nativeStore.todos.set(testData.slice(0, 100));
          break;
        case 'update':
          this.nativeStore.todos.update((todos) =>
            todos.map((todo) => ({ ...todo, completed: !todo.completed }))
          );
          break;
        case 'filter':
          this.nativeStore.filter.set(i % 2 === 0 ? 'active' : 'completed');
          break;
        case 'query': {
          const filtered = this.nativeStore
            .todos()
            .filter(
              (t) =>
                this.nativeStore.filter() === 'all' ||
                (this.nativeStore.filter() === 'active' && !t.completed) ||
                (this.nativeStore.filter() === 'completed' && t.completed)
            );
          void filtered.length;
          break;
        }
      }
    }

    return performance.now() - startTime;
  }

  initializeLiveData() {
    const testData = generateTodos(this.liveDataSize);

    const startTime = performance.now();
    this.signalTreeStore.$.todos.set(testData);
    this.nativeStore.todos.set(testData);
    this.lastOperationTime = performance.now() - startTime;

    this.liveDataInitialized = true;
    this.operationsPerformed++;
  }

  performRandomUpdates() {
    if (!this.liveDataInitialized) return;

    const startTime = performance.now();

    // Perform 100 random updates
    for (let i = 0; i < 100; i++) {
      const randomIndex = Math.floor(Math.random() * this.liveDataSize);

      // SignalTree update
      this.signalTreeStore.$.todos.update((todos) =>
        todos.map((todo, idx) =>
          idx === randomIndex ? { ...todo, completed: !todo.completed } : todo
        )
      );

      // Native update
      this.nativeStore.todos.update((todos) =>
        todos.map((todo, idx) =>
          idx === randomIndex ? { ...todo, completed: !todo.completed } : todo
        )
      );
    }

    this.lastOperationTime = performance.now() - startTime;
    this.operationsPerformed++;
  }

  clearResults() {
    this.results.set([]);
  }

  getPerformanceWidth(result: BenchmarkResult): number {
    const allResults = this.results();
    const sameOperation = allResults.filter(
      (r) => r.operation === result.operation
    );
    const maxTime = Math.max(...sameOperation.map((r) => r.avgTime));
    return Math.max(10, (result.avgTime / maxTime) * 100);
  }

  getPerformanceBarClass(result: BenchmarkResult): string {
    const allResults = this.results();
    const sameOperation = allResults.filter(
      (r) => r.operation === result.operation
    );
    const minTime = Math.min(...sameOperation.map((r) => r.avgTime));

    if (result.avgTime === minTime) {
      return 'bg-green-500'; // Best performance
    } else if (result.avgTime < minTime * 1.5) {
      return 'bg-yellow-500'; // Good performance
    } else {
      return 'bg-red-500'; // Poor performance
    }
  }

  getPerformanceRating(result: BenchmarkResult): string {
    const allResults = this.results();
    const sameOperation = allResults.filter(
      (r) => r.operation === result.operation
    );
    const minTime = Math.min(...sameOperation.map((r) => r.avgTime));

    if (result.avgTime === minTime) {
      return 'Best';
    } else if (result.avgTime < minTime * 1.5) {
      return 'Good';
    } else {
      return 'Slow';
    }
  }
}
