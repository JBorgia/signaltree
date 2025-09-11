import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { createSelector } from '@ngrx/store';
import { withBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';

interface BenchmarkResult {
  scenario: string;
  library: string;
  p50: number;
  p95: number;
  samples: number[];
  timestamp: string;
}

@Component({
  selector: 'app-signaltree-vs-ngrx-store',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="comparison-container">
      <div class="header">
        <h2>🏗️ SignalTree vs NgRx Store</h2>
        <p class="description">
          <strong>State Management Libraries:</strong> Granular reactivity vs
          Redux pattern with immutable updates.
        </p>
      </div>

      <div class="test-scenarios">
        <div class="scenario">
          <h3>Deep Nested Updates</h3>
          <p>
            Update deeply nested state - tests architectural efficiency for
            complex state trees.
          </p>
          <button
            [disabled]="running()"
            (click)="runDeepNestedTest()"
            class="test-btn"
          >
            {{ running() ? 'Testing...' : 'Run Test' }}
          </button>
        </div>

        <div class="scenario">
          <h3>Large Array Updates</h3>
          <p>
            Update single items in large arrays - tests update granularity and
            selector efficiency.
          </p>
          <button
            [disabled]="running()"
            (click)="runArrayUpdateTest()"
            class="test-btn"
          >
            {{ running() ? 'Testing...' : 'Run Test' }}
          </button>
        </div>

        <div class="scenario">
          <h3>Selector Performance</h3>
          <p>
            Derived state calculations - tests memoization and computed
            efficiency.
          </p>
          <button
            [disabled]="running()"
            (click)="runSelectorTest()"
            class="test-btn"
          >
            {{ running() ? 'Testing...' : 'Run Test' }}
          </button>
        </div>
      </div>

      <div class="results" *ngIf="results().length > 0">
        <h3>Performance Results</h3>
        <table class="results-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Library</th>
              <th>P50 (ms)</th>
              <th>P95 (ms)</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let result of results()"
              [class.faster]="isFaster(result)"
            >
              <td>{{ result.scenario }}</td>
              <td>{{ result.library }}</td>
              <td>{{ result.p50.toFixed(3) }}</td>
              <td>{{ result.p95.toFixed(3) }}</td>
              <td>{{ result.samples.length }}</td>
            </tr>
          </tbody>
        </table>

        <div class="insights" *ngIf="getInsights().length > 0">
          <h4>Key Insights</h4>
          <div class="insight-list">
            <div class="insight" *ngFor="let insight of getInsights()">
              <strong>{{ insight.scenario }}:</strong> {{ insight.comparison }}
            </div>
          </div>
        </div>
      </div>

      <div class="architecture-explanation">
        <h3>Architectural Differences</h3>
        <div class="arch-grid">
          <div class="arch-card">
            <h4>SignalTree</h4>
            <ul>
              <li>Direct property mutation</li>
              <li>Granular reactivity per path</li>
              <li>Automatic dependency tracking</li>
              <li>Built-in batching & memoization</li>
            </ul>
          </div>
          <div class="arch-card">
            <h4>NgRx Store</h4>
            <ul>
              <li>Immutable state updates</li>
              <li>Action/Reducer pattern</li>
              <li>Memoized selectors</li>
              <li>Redux DevTools integration</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .comparison-container {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 2rem;
      }

      .header h2 {
        color: #2d3748;
        margin-bottom: 0.5rem;
      }

      .description {
        color: #718096;
        margin-bottom: 2rem;
      }

      .test-scenarios {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
      }

      .scenario {
        background: #f7fafc;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }

      .scenario h3 {
        color: #2d3748;
        margin-bottom: 0.75rem;
        font-size: 1.1rem;
      }

      .scenario p {
        color: #4a5568;
        margin-bottom: 1.5rem;
        line-height: 1.5;
        font-size: 0.9rem;
      }

      .test-btn {
        background: #4299e1;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        width: 100%;
      }

      .test-btn:disabled {
        background: #a0aec0;
        cursor: not-allowed;
      }

      .results-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1.5rem;
      }

      .results-table th,
      .results-table td {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 1px solid #e2e8f0;
        font-size: 0.9rem;
      }

      .results-table th {
        background: #f7fafc;
        font-weight: 600;
      }

      .faster {
        background: #f0fff4;
      }

      .insights {
        background: #ebf8ff;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
      }

      .insight-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .insight {
        color: #2b6cb0;
        font-size: 0.95rem;
      }

      .architecture-explanation h3 {
        color: #2d3748;
        margin-bottom: 1rem;
      }

      .arch-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
      }

      .arch-card {
        background: #f7fafc;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }

      .arch-card h4 {
        color: #2d3748;
        margin-bottom: 1rem;
      }

      .arch-card ul {
        list-style: none;
        padding: 0;
      }

      .arch-card li {
        color: #4a5568;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
      }

      .arch-card li::before {
        content: '• ';
        color: #4299e1;
        font-weight: bold;
      }
    `,
  ],
})
export class SignalTreeVsNgrxStoreComponent {
  running = signal(false);
  results = signal<BenchmarkResult[]>([]);

  async runDeepNestedTest() {
    this.running.set(true);
    try {
      const signalTreeResult = await this.benchmarkSignalTreeDeepNested();
      const ngrxResult = await this.benchmarkNgrxDeepNested();

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Deep Nested Updates'),
        signalTreeResult,
        ngrxResult,
      ]);
    } finally {
      this.running.set(false);
    }
  }

  async runArrayUpdateTest() {
    this.running.set(true);
    try {
      const signalTreeResult = await this.benchmarkSignalTreeArrayUpdate();
      const ngrxResult = await this.benchmarkNgrxArrayUpdate();

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Large Array Updates'),
        signalTreeResult,
        ngrxResult,
      ]);
    } finally {
      this.running.set(false);
    }
  }

  async runSelectorTest() {
    this.running.set(true);
    try {
      const signalTreeResult = await this.benchmarkSignalTreeSelector();
      const ngrxResult = await this.benchmarkNgrxSelector();

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Selector Performance'),
        signalTreeResult,
        ngrxResult,
      ]);
    } finally {
      this.running.set(false);
    }
  }

  private async benchmarkSignalTreeDeepNested(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const testData = this.createDeepNestedData();
      const store = signalTree(testData).with(
        withBatching(),
        withMemoization()
      );

      // Create multiple computed values that depend on the nested value
      const computed1 = computed(
        () => store.state.level1.level2.level3.level4.value() * 2
      );
      const computed2 = computed(
        () => store.state.level1.level2.level3.level4.value() + 100
      );
      const computed3 = computed(() =>
        store.state.level1.level2.level3.level4.value().toString()
      );

      // Warm up - trigger computeds
      computed1();
      computed2();
      computed3();

      const startTime = performance.now();

      // Do multiple nested updates to make the work more substantial
      for (let j = 0; j < 10; j++) {
        store.state.level1.level2.level3.level4.value(i + j);
        // Force evaluation of computeds to trigger reactivity
        computed1();
        computed2();
        computed3();
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Deep Nested Updates', 'SignalTree', samples);
  }

  private async benchmarkNgrxDeepNested(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const testData = this.createDeepNestedData();
      let state = testData;

      // Create signals to track state and computeds for equivalent comparison
      const stateSignal = signal(state);
      const computed1 = computed(
        () => stateSignal().level1.level2.level3.level4.value * 2
      );
      const computed2 = computed(
        () => stateSignal().level1.level2.level3.level4.value + 100
      );
      const computed3 = computed(() =>
        stateSignal().level1.level2.level3.level4.value.toString()
      );

      // Warm up
      computed1();
      computed2();
      computed3();

      const startTime = performance.now();

      // Do multiple nested updates equivalent to SignalTree test
      for (let j = 0; j < 10; j++) {
        state = {
          ...state,
          level1: {
            ...state.level1,
            level2: {
              ...state.level1.level2,
              level3: {
                ...state.level1.level2.level3,
                level4: {
                  ...state.level1.level2.level3.level4,
                  value: i + j,
                },
              },
            },
          },
        };

        // Update signal to trigger reactivity
        stateSignal.set(state);
        // Force evaluation of computeds
        computed1();
        computed2();
        computed3();
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Deep Nested Updates', 'NgRx Store', samples);
  }

  private async benchmarkSignalTreeArrayUpdate(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const testData = { items: this.createLargeArray(1000) };
      const store = signalTree(testData).with(withBatching());

      // Create computeds that depend on the array
      const totalComputed = computed(() =>
        store.state.items().reduce((sum, item) => sum + item.value, 0)
      );
      const filteredComputed = computed(
        () => store.state.items().filter((item) => item.value > 500).length
      );

      // Warm up
      totalComputed();
      filteredComputed();

      const startTime = performance.now();

      // Update multiple items in the array to make the work more substantial
      for (let j = 0; j < 10; j++) {
        store.state.items.update((items) => {
          items[500 + j].value = i + j;
          return items;
        });
        // Force evaluation to trigger reactivity
        totalComputed();
        filteredComputed();
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Large Array Updates', 'SignalTree', samples);
  }

  private async benchmarkNgrxArrayUpdate(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      let state = { items: this.createLargeArray(1000) };

      // Create signals and computeds for equivalent comparison
      const stateSignal = signal(state);
      const totalComputed = computed(() =>
        stateSignal().items.reduce((sum, item) => sum + item.value, 0)
      );
      const filteredComputed = computed(
        () => stateSignal().items.filter((item) => item.value > 500).length
      );

      // Warm up
      totalComputed();
      filteredComputed();

      const startTime = performance.now();

      // Update multiple items equivalent to SignalTree test
      for (let j = 0; j < 10; j++) {
        state = {
          ...state,
          items: state.items.map((item, index) =>
            index === 500 + j ? { ...item, value: i + j } : item
          ),
        };

        // Update signal to trigger reactivity
        stateSignal.set(state);
        // Force evaluation
        totalComputed();
        filteredComputed();
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Large Array Updates', 'NgRx Store', samples);
  }

  private async benchmarkSignalTreeSelector(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    const testData = { items: this.createLargeArray(1000) };
    const store = signalTree(testData).with(withMemoization());

    // Create derived computation
    const expensiveComputation = computed(() => {
      return store.state
        .items()
        .filter((item) => item.value > 500)
        .map((item) => ({ ...item, computed: item.value * 2 }))
        .sort((a, b) => b.value - a.value);
    });

    // Create additional computeds for more substantial work
    const totalComputed = computed(() =>
      store.state.items().reduce((sum, item) => sum + item.value, 0)
    );
    const averageComputed = computed(
      () => totalComputed() / store.state.items().length
    );

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      // Access computed values multiple times with additional work
      for (let j = 0; j < 10; j++) {
        expensiveComputation();
        totalComputed();
        averageComputed();
        // Update an item to trigger recomputation
        const items = store.state.items();
        items[j % 1000].value = i + j;
        store.state.items(items);
        // Re-access after update
        expensiveComputation();
        totalComputed();
        averageComputed();
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Selector Performance', 'SignalTree', samples);
  }

  private async benchmarkNgrxSelector(): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const iterations = 100;

    let state = { items: this.createLargeArray(1000) };

    type Item = { id: number; name: string; value: number };

    // Create NgRx-style memoized selector
    const expensiveSelector = createSelector(
      (state: { items: Item[] }) => state.items,
      (items: Item[]) =>
        items
          .filter((item: Item) => item.value > 500)
          .map((item: Item) => ({ ...item, computed: item.value * 2 }))
          .sort(
            (a: Item & { computed: number }, b: Item & { computed: number }) =>
              b.value - a.value
          )
    );

    // Create additional selectors for more substantial work
    const totalSelector = createSelector(
      (state: { items: Item[] }) => state.items,
      (items: Item[]) => items.reduce((sum, item) => sum + item.value, 0)
    );

    const averageSelector = createSelector(
      totalSelector,
      (state: { items: Item[] }) => state.items,
      (total: number, items: Item[]) => total / items.length
    );

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      // Access selectors multiple times with state updates
      for (let j = 0; j < 10; j++) {
        expensiveSelector(state);
        totalSelector(state);
        averageSelector(state);
        // Update state to trigger selector recomputation
        state = {
          ...state,
          items: state.items.map((item, index) =>
            index === j % 1000 ? { ...item, value: i + j } : item
          ),
        };
        // Re-access after update
        expensiveSelector(state);
        totalSelector(state);
        averageSelector(state);
      }

      const endTime = performance.now();
      samples.push(endTime - startTime);
    }

    return this.calculateStats('Selector Performance', 'NgRx Store', samples);
  }

  private createDeepNestedData() {
    return {
      level1: {
        level2: {
          level3: {
            level4: {
              value: 0,
            },
          },
        },
      },
    };
  }

  private createLargeArray(size: number) {
    return Array.from({ length: size }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.floor(Math.random() * 1000),
    }));
  }

  private calculateStats(
    scenario: string,
    library: string,
    samples: number[]
  ): BenchmarkResult {
    const sorted = [...samples].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      scenario,
      library,
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      samples,
      timestamp: new Date().toISOString(),
    };
  }

  isFaster(result: BenchmarkResult): boolean {
    const results = this.results();
    const sameScenario = results.filter((r) => r.scenario === result.scenario);
    if (sameScenario.length !== 2) return false;

    const otherResult = sameScenario.find((r) => r.library !== result.library);
    return otherResult ? result.p50 < otherResult.p50 : false;
  }

  getInsights(): Array<{ scenario: string; comparison: string }> {
    const insights: Array<{ scenario: string; comparison: string }> = [];
    const results = this.results();
    const scenarios = [...new Set(results.map((r) => r.scenario))];

    scenarios.forEach((scenario) => {
      const scenarioResults = results.filter((r) => r.scenario === scenario);
      if (scenarioResults.length === 2) {
        const signalTreeResult = scenarioResults.find(
          (r) => r.library === 'SignalTree'
        );
        const ngrxResult = scenarioResults.find(
          (r) => r.library === 'NgRx Store'
        );

        if (signalTreeResult && ngrxResult) {
          const faster =
            signalTreeResult.p50 < ngrxResult.p50 ? 'SignalTree' : 'NgRx Store';
          const speedup =
            faster === 'SignalTree'
              ? (ngrxResult.p50 / signalTreeResult.p50).toFixed(1)
              : (signalTreeResult.p50 / ngrxResult.p50).toFixed(1);

          insights.push({
            scenario,
            comparison: `${faster} is ${speedup}x faster`,
          });
        }
      }
    });

    return insights;
  }
}
