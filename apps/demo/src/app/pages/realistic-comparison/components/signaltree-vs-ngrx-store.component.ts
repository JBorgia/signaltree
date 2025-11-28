import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { createSelector } from '@ngrx/store';
import {
  signalTree,
  withBatching,
  withHighPerformanceBatching,
  withLightweightMemoization,
  withShallowMemoization,
} from '@signaltree/core';

import { PerformanceGraphComponent } from '../../../shared/performance-graph/performance-graph.component';
import { BenchmarkCalibrationService } from '../benchmark-calibration.service';

// Switched to shared ECharts-based graph
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
  imports: [CommonModule, PerformanceGraphComponent],
  template: `
    <!-- Running overlay with spinner and progress -->
    @if(running()){
    <div class="overlay">
      <div class="overlay-card">
        <div class="spinner" aria-hidden="true"></div>
        <div class="overlay-text">
          <div class="label">Running</div>
          <div class="scenario">{{ overlayTask() }}</div>
          <div class="progress">
            {{ overlayIteration() }} / {{ overlayTotal() }}
          </div>
        </div>
      </div>
    </div>
    }

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
          <h3>Full Benchmark Battery</h3>
          <p>
            Runs Deep Nested, Large Array Updates, and Selector Performance for
            both libraries across multiple rounds. Graph shows all series with
            legend toggling.
          </p>
          <button
            [disabled]="running() || !hasCalibration()"
            (click)="runFullBattery()"
            class="test-btn"
          >
            {{ running() ? 'Running…' : 'Run Full Battery' }}
          </button>
          @if (!hasCalibration()) {
          <p class="hint">Calibrate environment above to enable runs.</p>
          }
        </div>
      </div>

      @if (results().length > 0) {
      <div class="results">
        <h3>Performance Results</h3>
        <div class="charts">
          <div class="chart-block">
            <app-performance-graph
              [title]="'All Scenarios: per-iteration (ms)'"
              [series]="allSeries()"
              [height]="360"
            />
          </div>
        </div>
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
            @for (result of results(); track result.scenario + '-' +
            result.library) {
            <tr [class.faster]="isFaster(result)">
              <td>{{ result.scenario }}</td>
              <td>{{ result.library }}</td>
              <td>{{ result.p50.toFixed(3) }}</td>
              <td>{{ result.p95.toFixed(3) }}</td>
              <td>{{ result.samples.length }}</td>
            </tr>
            }
          </tbody>
        </table>

        @if (getInsights().length > 0) {
        <div class="insights">
          <h4>Key Insights</h4>
          <div class="insight-list">
            @for (insight of getInsights(); track insight.scenario) {
            <div class="insight">
              <strong>{{ insight.scenario }}:</strong>
              {{ insight.comparison }}
            </div>
            }
          </div>
        </div>
        }
      </div>
      }

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
      /* Overlay styles */
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .overlay-card {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        min-width: 280px;
        gap: 12px;
      }
      .spinner {
        width: 28px;
        height: 28px;
        border: 3px solid #e0e0e0;
        border-top-color: #2b6cb0;
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .overlay-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .overlay-text .label {
        font-size: 12px;
        color: #666;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .overlay-text .scenario {
        font-weight: 600;
        color: #111;
      }
      .overlay-text .progress {
        font-variant-numeric: tabular-nums;
        color: #333;
      }
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
      .charts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .chart-block {
        background: #f7fafc;
        padding: 0.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        height: 420px; /* gives echarts a concrete height to fill */
      }
      .chart-block echarts,
      .chart-block .chart {
        width: 100%;
        height: 100%;
        display: block;
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
      .hint {
        margin-top: 0.5rem;
        color: #a0aec0;
        font-size: 0.9rem;
      }
    `,
  ],
})
export class SignalTreeVsNgrxStoreComponent {
  running = signal(false);
  // Overlay progress
  overlayTask = signal<string>('');
  overlayIteration = signal<number>(0);
  overlayTotal = signal<number>(0);
  results = signal<BenchmarkResult[]>([]);
  private readonly calibration = inject(BenchmarkCalibrationService);
  readonly hasCalibration = computed(() => !!this.calibration.plan());
  private readonly defaultRounds = 3; // run multiple rounds for stability
  // Tunable complexity knobs
  private readonly arraySize = 3000; // larger than 1000 to increase workload
  private readonly deepPadding = { l1: 300, l2: 150, l3: 75, l4: 30 };
  // Live series consumed by ECharts component
  deepSeries = {
    st: [] as number[],
    nx: [] as number[],
  };
  arraySeries = {
    st: [] as number[],
    nx: [] as number[],
  };
  selectorSeries = {
    st: [] as number[],
    nx: [] as number[],
  };

  async runDeepNestedTest() {
    this.running.set(true);
    try {
      const plan = this.calibration.getPlan('deepNested');
      this.beginOverlay(
        'Deep Nested Updates',
        this.defaultRounds * 2 * plan.iterations
      );
      const { signalTreeAgg, ngrxAgg } = await this.runDeepNestedRounds(
        this.defaultRounds
      );

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Deep Nested Updates'),
        signalTreeAgg,
        ngrxAgg,
      ]);
    } finally {
      this.running.set(false);
      this.endOverlay();
    }
  }

  async runArrayUpdateTest() {
    this.running.set(true);
    try {
      const plan = this.calibration.getPlan('arrayUpdates');
      this.beginOverlay(
        'Large Array Updates',
        this.defaultRounds * 2 * plan.iterations
      );
      const { signalTreeAgg, ngrxAgg } = await this.runArrayUpdateRounds(
        this.defaultRounds
      );

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Large Array Updates'),
        signalTreeAgg,
        ngrxAgg,
      ]);
    } finally {
      this.running.set(false);
      this.endOverlay();
    }
  }

  async runSelectorTest() {
    this.running.set(true);
    try {
      const plan = this.calibration.getPlan('selectorPerf');
      this.beginOverlay(
        'Selector Performance',
        this.defaultRounds * 2 * plan.iterations
      );
      const { signalTreeAgg, ngrxAgg } = await this.runSelectorRounds(
        this.defaultRounds
      );

      this.results.update((prev) => [
        ...prev.filter((r) => r.scenario !== 'Selector Performance'),
        signalTreeAgg,
        ngrxAgg,
      ]);
    } finally {
      this.running.set(false);
      this.endOverlay();
    }
  }

  // Combined run: executes all three scenarios across configured rounds.
  async runFullBattery() {
    if (this.running()) return;
    if (!this.hasCalibration()) return;
    this.running.set(true);
    // Clear series
    this.deepSeries = { st: [], nx: [] };
    this.arraySeries = { st: [], nx: [] };
    this.selectorSeries = { st: [], nx: [] };
    try {
      await this.runDeepNestedTest();
      await this.runArrayUpdateTest();
      await this.runSelectorTest();
    } finally {
      this.running.set(false);
    }
  }

  // Build multi-series payload for the shared graph
  allSeries() {
    return [
      { name: 'Deep — SignalTree', data: this.deepSeries.st },
      { name: 'Deep — NgRx Store', data: this.deepSeries.nx },
      { name: 'Array — SignalTree', data: this.arraySeries.st },
      { name: 'Array — NgRx Store', data: this.arraySeries.nx },
      { name: 'Selector — SignalTree', data: this.selectorSeries.st },
      { name: 'Selector — NgRx Store', data: this.selectorSeries.nx },
    ];
  }

  private async benchmarkSignalTreeDeepNested(
    innerOps = 25,
    iterations = 100,
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default

    for (let i = 0; i < iterations; i++) {
      const testData = this.createDeepNestedData();
      // Deep Nested scenario mapping: batching + shallow memoization
      const store = signalTree(testData).with(
        withBatching(),
        withShallowMemoization()
      );

      // Create computed values with MODERATE intensive work (reduced from extreme)
      const computed1 = computed(() => {
        const value = store.state.level1.level2.level3.level4.value();
        // Moderate mathematical computation (reduced from 5000 to 1000)
        let result = 0;
        for (let k = 0; k < 1000; k++) {
          result += Math.sin(value + k) * Math.cos(k);
        }
        return result;
      });

      const computed2 = computed(() => {
        const value = store.state.level1.level2.level3.level4.value();
        // Moderate string manipulation (reduced from 1000 to 200)
        let str = value.toString();
        for (let k = 0; k < 200; k++) {
          str = str + Math.random().toString(36).substring(2, 8);
        }
        return str.length;
      });

      const computed3 = computed(() => {
        const value = store.state.level1.level2.level3.level4.value();
        // Moderate array operations (reduced from 2000 to 500)
        const arr = Array.from({ length: 500 }, (_, idx) => value + idx);
        return arr
          .sort((a, b) => b - a)
          .slice(0, 100)
          .reduce((sum, val) => sum + val, 0);
      }); // Warm up - trigger computeds
      computed1();
      computed2();
      computed3();

      const startTime = performance.now();

      // Do N operations per iteration for measurable work
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const v = valuePlan ? valuePlan[k] : i * 25 + j;
        store.state.level1.level2.level3.level4.value(v);
        // Force evaluation of ALL computeds to ensure work is done
        const result1 = computed1();
        const result2 = computed2();
        const result3 = computed3();
        void (result1 + result2 + result3 < -Infinity);
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      // Live series point
      this.deepSeries.st.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Deep Nested Updates', 'SignalTree', samples);
  }

  private async benchmarkNgrxDeepNested(
    innerOps = 25,
    iterations = 100,
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default

    for (let i = 0; i < iterations; i++) {
      const testData = this.createDeepNestedData();
      let state = testData;

      // Create signals to track state and computeds with MODERATE intensive work equivalent to SignalTree
      const stateSignal = signal(state);
      const computed1 = computed(() => {
        const value = stateSignal().level1.level2.level3.level4.value;
        // Moderate mathematical computation (reduced from 5000 to 1000)
        let result = 0;
        for (let k = 0; k < 1000; k++) {
          result += Math.sin(value + k) * Math.cos(k);
        }
        return result;
      });

      const computed2 = computed(() => {
        const value = stateSignal().level1.level2.level3.level4.value;
        // Moderate string manipulation (reduced from 1000 to 200)
        let str = value.toString();
        for (let k = 0; k < 200; k++) {
          str = str + Math.random().toString(36).substring(2, 8);
        }
        return str.length;
      });

      const computed3 = computed(() => {
        const value = stateSignal().level1.level2.level3.level4.value;
        // Moderate array operations (reduced from 2000 to 500)
        const arr = Array.from({ length: 500 }, (_, idx) => value + idx);
        return arr
          .sort((a, b) => b - a)
          .slice(0, 100)
          .reduce((sum, val) => sum + val, 0);
      }); // Warm up
      computed1();
      computed2();
      computed3();

      const startTime = performance.now();

      // Do N operations per iteration equivalent to SignalTree test
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const v = valuePlan ? valuePlan[k] : i * 25 + j;
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
                  value: v,
                },
              },
            },
          },
        };

        // Update signal to trigger reactivity
        stateSignal.set(state);
        // Force evaluation of ALL computeds to ensure work is done
        const result1 = computed1();
        const result2 = computed2();
        const result3 = computed3();
        void (result1 + result2 + result3 < -Infinity);
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      // Live series point
      this.deepSeries.nx.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Deep Nested Updates', 'NgRx Store', samples);
  }

  // Run multiple rounds, alternating order and using the same value plan per round
  private async runDeepNestedRounds(rounds = 3) {
    const plan = this.calibration.getPlan('deepNested');
    const sigSamples: number[] = [];
    const ngrxSamples: number[] = [];

    for (let r = 0; r < rounds; r++) {
      // Build a deterministic value plan shared across both libraries for this round
      const valuePlan = this.buildValuePlan(
        plan.iterations * plan.innerOps,
        12345 + r
      );
      const signalTreeFirst = r % 2 === 0; // alternate order each round

      if (signalTreeFirst) {
        const st = await this.benchmarkSignalTreeDeepNested(
          plan.innerOps,
          plan.iterations,
          valuePlan
        );
        sigSamples.push(...st.samples);
        const nx = await this.benchmarkNgrxDeepNested(
          plan.innerOps,
          plan.iterations,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
      } else {
        const nx = await this.benchmarkNgrxDeepNested(
          plan.innerOps,
          plan.iterations,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
        const st = await this.benchmarkSignalTreeDeepNested(
          plan.innerOps,
          plan.iterations,
          valuePlan
        );
        sigSamples.push(...st.samples);
      }
    }

    const signalTreeAgg = this.calculateStats(
      'Deep Nested Updates',
      'SignalTree',
      sigSamples
    );
    const ngrxAgg = this.calculateStats(
      'Deep Nested Updates',
      'NgRx Store',
      ngrxSamples
    );

    return { signalTreeAgg, ngrxAgg };
  }

  // Deterministic value generator for parity between libraries
  private buildValuePlan(length: number, seed: number): number[] {
    const rand = this.mulberry32(seed);
    const out = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      // Spread over a wide range to avoid trivial optimizer constants
      out[i] = Math.floor(rand() * 1_000_000);
    }
    return out;
  }

  private mulberry32(a: number) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private async benchmarkSignalTreeArrayUpdate(
    innerOps = 10,
    iterations = 100,
    seedBase?: number,
    indexPlan?: number[],
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default

    for (let i = 0; i < iterations; i++) {
      const testData = {
        items:
          seedBase !== undefined
            ? this.buildLargeArray(this.arraySize, (seedBase + i) | 0)
            : this.createLargeArray(this.arraySize),
      };
      // Array Updates scenario mapping: high-performance batching only
      const store = signalTree(testData).with(withHighPerformanceBatching());

      // Create computeds with MODERATE work that depend on the array
      const totalComputed = computed(() => {
        const items = store.state.items();
        // Moderate computation on array (simplified)
        let total = 0;
        for (let k = 0; k < Math.min(items.length, 200); k++) {
          total += items[k].value * (k + 1);
        }
        return total;
      });

      const filteredComputed = computed(() => {
        const items = store.state.items();
        // Moderate filtering and processing
        return items
          .filter((item) => item.value > 500)
          .slice(0, 50)
          .map((item) => item.value * 2)
          .reduce((sum, val) => sum + val, 0);
      });

      const aggregatedComputed = computed(() => {
        const items = store.state.items();
        // Moderate array work
        const grouped = items.slice(0, 100).reduce((acc, item) => {
          const key = Math.floor(item.value / 100);
          acc[key] = (acc[key] || 0) + item.value;
          return acc;
        }, {} as Record<number, number>);
        return Object.values(grouped).reduce((sum, val) => sum + val, 0);
      });

      // Warm up
      totalComputed();
      filteredComputed();
      aggregatedComputed();

      const startTime = performance.now();

      // Update multiple items in the array - operations based on plan
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const idx = indexPlan ? indexPlan[k] % this.arraySize : 500 + (j % 500);
        const newVal = valuePlan ? valuePlan[k] : i * innerOps + j;
        store.state.items.update((items) => {
          items[idx].value = newVal;
          return items;
        });
        // Force evaluation to trigger ALL computations
        const result1 = totalComputed();
        const result2 = filteredComputed();
        const result3 = aggregatedComputed();
        void (result1 + result2 + result3 < -Infinity);
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      this.arraySeries.st.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Large Array Updates', 'SignalTree', samples);
  }

  private async benchmarkNgrxArrayUpdate(
    innerOps = 10,
    iterations = 100,
    seedBase?: number,
    indexPlan?: number[],
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default

    for (let i = 0; i < iterations; i++) {
      let state = {
        items:
          seedBase !== undefined
            ? this.buildLargeArray(this.arraySize, (seedBase + i) | 0)
            : this.createLargeArray(this.arraySize),
      };

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
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const idx = indexPlan ? indexPlan[k] % this.arraySize : 500 + j;
        const newVal = valuePlan ? valuePlan[k] : i * innerOps + j;
        state = {
          ...state,
          items: state.items.map((item, index) =>
            index === idx ? { ...item, value: newVal } : item
          ),
        };

        // Update signal to trigger reactivity
        stateSignal.set(state);
        // Force evaluation
        totalComputed();
        filteredComputed();
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      this.arraySeries.nx.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Large Array Updates', 'NgRx Store', samples);
  }

  private async benchmarkSignalTreeSelector(
    innerOps = 10,
    iterations = 100,
    seedBase?: number,
    indexPlan?: number[],
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default
    const seed = seedBase ?? 7777;
    const testData = { items: this.buildLargeArray(this.arraySize, seed) };
    // Selector Performance scenario mapping: lightweight memoization
    const store = signalTree(testData).with(withLightweightMemoization());

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
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const idx = indexPlan
          ? indexPlan[k] % this.arraySize
          : j % this.arraySize;
        const newVal = valuePlan ? valuePlan[k] : i * innerOps + j;
        expensiveComputation();
        totalComputed();
        averageComputed();
        // Update an item to trigger recomputation
        const items = store.state.items();
        items[idx].value = newVal;
        store.state.items(items);
        // Re-access after update
        expensiveComputation();
        totalComputed();
        averageComputed();
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      this.selectorSeries.st.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Selector Performance', 'SignalTree', samples);
  }

  private async benchmarkNgrxSelector(
    innerOps = 10,
    iterations = 100,
    seedBase?: number,
    indexPlan?: number[],
    valuePlan?: number[]
  ): Promise<BenchmarkResult> {
    const samples: number[] = [];
    // iterations param overrides default

    const seed = seedBase ?? 7777;
    let state = { items: this.buildLargeArray(this.arraySize, seed) };

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
      for (let j = 0; j < innerOps; j++) {
        const k = i * innerOps + j;
        const idx = indexPlan
          ? indexPlan[k] % this.arraySize
          : j % this.arraySize;
        const newVal = valuePlan ? valuePlan[k] : i * innerOps + j;
        expensiveSelector(state);
        totalSelector(state);
        averageSelector(state);
        // Update state to trigger selector recomputation
        state = {
          ...state,
          items: state.items.map((item, index) =>
            index === idx ? { ...item, value: newVal } : item
          ),
        };
        // Re-access after update
        expensiveSelector(state);
        totalSelector(state);
        averageSelector(state);
      }

      const endTime = performance.now();
      const ms = endTime - startTime;
      samples.push(ms);
      this.selectorSeries.nx.push(ms);
      this.tickOverlay();
    }

    return this.calculateStats('Selector Performance', 'NgRx Store', samples);
  }

  private createDeepNestedData() {
    const seed = 24680;
    return {
      level1: {
        padding: this.buildPaddingArray(this.deepPadding.l1, seed + 1),
        level2: {
          padding: this.buildPaddingArray(this.deepPadding.l2, seed + 2),
          level3: {
            padding: this.buildPaddingArray(this.deepPadding.l3, seed + 3),
            level4: {
              value: 0,
              padding: this.buildPaddingArray(this.deepPadding.l4, seed + 4),
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

  private buildLargeArray(size: number, seed: number) {
    const rand = this.mulberry32(seed);
    return Array.from({ length: size }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.floor(rand() * 1000),
    }));
  }

  private buildPaddingArray(size: number, seed: number) {
    const rand = this.mulberry32(seed);
    return Array.from({ length: size }, (_, i) => ({
      k: `k${i}`,
      v: Math.floor(rand() * 10_000),
    }));
  }

  private calculateStats(
    scenario: string,
    library: string,
    samples: number[]
  ): BenchmarkResult {
    const sorted = [...samples].sort((a, b) => a - b);
    // Trim 2% tails to reduce outlier impact when enough samples
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    const p50Index = Math.floor(trimmed.length * 0.5);
    const p95Index = Math.floor(trimmed.length * 0.95);

    return {
      scenario,
      library,
      p50: trimmed[p50Index] ?? sorted[Math.floor(n * 0.5)] ?? 0,
      p95: trimmed[p95Index] ?? sorted[Math.floor(n * 0.95)] ?? 0,
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
              ? (ngrxResult.p50 / signalTreeResult.p50).toFixed(4)
              : (signalTreeResult.p50 / ngrxResult.p50).toFixed(4);

          insights.push({
            scenario,
            comparison: `${faster} is ${speedup}x faster`,
          });
        }
      }
    });

    return insights;
  }

  // Helper to run all scenarios once using the current calibration plan
  async runAllScenariosOnce() {
    await this.runDeepNestedTest();
    await this.runArrayUpdateTest();
    await this.runSelectorTest();
  }

  // Multi-round runner for Array Updates with parity and alternating order
  private async runArrayUpdateRounds(rounds = 3) {
    const plan = this.calibration.getPlan('arrayUpdates');
    const sigSamples: number[] = [];
    const ngrxSamples: number[] = [];

    for (let r = 0; r < rounds; r++) {
      const seedBase = 54321 + r * 101;
      const totalOps = plan.iterations * plan.innerOps;
      const indexPlan = this.buildIndexPlan(
        totalOps,
        this.arraySize,
        seedBase + 1
      );
      const valuePlan = this.buildValuePlan(totalOps, seedBase + 2);
      const signalTreeFirst = r % 2 === 0;

      if (signalTreeFirst) {
        const st = await this.benchmarkSignalTreeArrayUpdate(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        sigSamples.push(...st.samples);
        const nx = await this.benchmarkNgrxArrayUpdate(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
      } else {
        const nx = await this.benchmarkNgrxArrayUpdate(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
        const st = await this.benchmarkSignalTreeArrayUpdate(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        sigSamples.push(...st.samples);
      }
    }

    const signalTreeAgg = this.calculateStats(
      'Large Array Updates',
      'SignalTree',
      sigSamples
    );
    const ngrxAgg = this.calculateStats(
      'Large Array Updates',
      'NgRx Store',
      ngrxSamples
    );

    return { signalTreeAgg, ngrxAgg };
  }

  // Multi-round runner for Selector Performance with parity and alternating order
  private async runSelectorRounds(rounds = 3) {
    const plan = this.calibration.getPlan('selectorPerf');
    const sigSamples: number[] = [];
    const ngrxSamples: number[] = [];

    for (let r = 0; r < rounds; r++) {
      const seedBase = 98765 + r * 73;
      const totalOps = plan.iterations * plan.innerOps;
      const indexPlan = this.buildIndexPlan(
        totalOps,
        this.arraySize,
        seedBase + 1
      );
      const valuePlan = this.buildValuePlan(totalOps, seedBase + 2);
      const signalTreeFirst = r % 2 === 0;

      if (signalTreeFirst) {
        const st = await this.benchmarkSignalTreeSelector(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        sigSamples.push(...st.samples);
        const nx = await this.benchmarkNgrxSelector(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
      } else {
        const nx = await this.benchmarkNgrxSelector(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        ngrxSamples.push(...nx.samples);
        const st = await this.benchmarkSignalTreeSelector(
          plan.innerOps,
          plan.iterations,
          seedBase,
          indexPlan,
          valuePlan
        );
        sigSamples.push(...st.samples);
      }
    }

    const signalTreeAgg = this.calculateStats(
      'Selector Performance',
      'SignalTree',
      sigSamples
    );
    const ngrxAgg = this.calculateStats(
      'Selector Performance',
      'NgRx Store',
      ngrxSamples
    );

    return { signalTreeAgg, ngrxAgg };
  }

  private buildIndexPlan(length: number, size: number, seed: number): number[] {
    const rand = this.mulberry32(seed);
    const out = new Array<number>(length);
    for (let i = 0; i < length; i++) out[i] = Math.floor(rand() * size);
    return out;
  }

  getResultsSnapshot() {
    return this.results();
  }

  private beginOverlay(task: string, iterations: number) {
    this.overlayTask.set(task);
    this.overlayTotal.set(iterations);
    this.overlayIteration.set(0);
  }

  private tickOverlay() {
    this.overlayIteration.update((v) => v + 1);
  }

  private endOverlay() {
    this.overlayTask.set('');
    this.overlayTotal.set(0);
    this.overlayIteration.set(0);
  }
}
