import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';
import {
  signalTree,
  withBatching,
  withHighPerformanceBatching,
  withShallowMemoization,
} from '@signaltree/core';

import { PerformanceGraphComponent } from '../../../shared/performance-graph/performance-graph.component';
import { BenchmarkCalibrationService } from '../benchmark-calibration.service';

interface BenchmarkResult {
  scenario: string;
  library: string;
  p50: number;
  p95: number;
  min: number;
  max: number;
  samples: number[];
  renderCount: number;
  timestamp: string;
}

interface DeepNestedState {
  level1: {
    level2: {
      level3: {
        level4: {
          level5: {
            counter: number;
            data: string;
          };
        };
      };
    };
  };
  users: Array<{
    id: number;
    name: string;
    email: string;
    profile: {
      settings: {
        theme: string;
        notifications: boolean;
      };
    };
  }>;
  metadata: {
    version: string;
    timestamp: number;
    config: {
      enableFeatureA: boolean;
      enableFeatureB: boolean;
      maxItems: number;
    };
  };
}

@Component({
  selector: 'app-signaltree-vs-ngrx-signals',
  standalone: true,
  imports: [CommonModule, PerformanceGraphComponent],
  template: `
    <!-- Running overlay with spinner and progress -->
    @if(isRunning()){
    <div class="overlay">
      <div class="overlay-card">
        <div class="spinner" aria-hidden="true"></div>
        <div class="overlay-text">
          <div class="label">Running</div>
          <div class="scenario">
            {{ currentTask() }} — {{ currentLibrary() }}
          </div>
          <div class="progress">
            {{ currentIteration() }} / {{ totalIterations() }}
          </div>
        </div>
      </div>
    </div>
    }

    <div class="comparison-section">
      <h3>SignalTree vs NgRx SignalStore</h3>
      <p>
        Comparing modern state management: SignalTree's direct mutation with
        batching vs NgRx SignalStore's immutable updates
      </p>

      <div class="benchmarks">
        <div class="benchmark-group">
          <h4>Full Benchmark Battery</h4>
          <button
            (click)="runFullBattery()"
            [disabled]="isRunning() || !hasCalibration()"
          >
            {{ isRunning() ? 'Running…' : 'Run Full Battery' }}
          </button>
          @if (!hasCalibration()) {
          <p class="hint">Calibrate environment above to enable runs.</p>
          }
          <app-performance-graph
            [title]="'All Scenarios: per-iteration (ms)'"
            [series]="allSeries()"
            [height]="360"
          />
        </div>
      </div>

      @if (allResults().length > 0) {
      <div class="all-results">
        <h4>All Benchmark Results</h4>
        <button (click)="exportResults()">Export Results (NDJSON)</button>
        <div class="results-table">
          <div class="table-header">
            <span>Scenario</span>
            <span>Library</span>
            <span>p50 (ms)</span>
            <span>p95 (ms)</span>
            <span>Samples</span>
          </div>
          @for (result of allResults(); track result.scenario + '-' +
          result.library) {
          <div class="table-row">
            <span>{{ result.scenario }}</span>
            <span>{{ result.library }}</span>
            <span>{{ result.p50 }}</span>
            <span>{{ result.p95 }}</span>
            <span>{{ result.samples.length }}</span>
          </div>
          }
        </div>
      </div>
      }
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
        border-top-color: #007acc;
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
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica,
          Arial, Apple Color Emoji, Segoe UI Emoji;
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

      .comparison-section {
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin: 20px 0;
      }

      .benchmark-group {
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 4px;
      }

      .benchmark-group h4 {
        margin-top: 0;
        color: #333;
      }

      button {
        padding: 10px 15px;
        margin: 10px 0;
        background-color: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
      }

      .results {
        margin-top: 15px;
        padding: 10px;
        background-color: #f9f9f9;
        border-radius: 4px;
      }

      .result-item {
        margin: 5px 0;
        font-family: monospace;
      }

      .performance-analysis {
        margin-top: 10px;
        padding: 8px;
        background-color: #e8f5e8;
        border-left: 4px solid #4caf50;
        font-weight: bold;
      }

      .results-table {
        margin-top: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      .benchmark-group app-performance-graph {
        display: block;
      }
      .benchmark-group .chart-block {
        height: 420px;
      }
      .benchmark-group echarts,
      .benchmark-group .chart {
        width: 100%;
        height: 100%;
        display: block;
      }

      .table-header {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        gap: 10px;
        padding: 10px;
        background-color: #f5f5f5;
        font-weight: bold;
        border-bottom: 1px solid #ddd;
      }

      .table-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        gap: 10px;
        padding: 10px;
        border-bottom: 1px solid #eee;
        font-family: monospace;
      }

      .table-row:nth-child(even) {
        background-color: #f9f9f9;
      }
      .hint {
        margin-top: 0.5rem;
        color: #6b7280;
        font-size: 0.9rem;
      }
    `,
  ],
})
export class SignalTreeVsNgrxSignalsComponent {
  private readonly calibration = inject(BenchmarkCalibrationService);
  readonly hasCalibration = computed(() => !!this.calibration.plan());
  readonly isRunning = signal(false);
  // Progress/overlay state
  readonly currentTask = signal<string>('');
  readonly currentLibrary = signal<string>('');
  readonly currentIteration = signal<number>(0);
  readonly totalIterations = signal<number>(0);
  // Live series for graphs
  readonly deepSeriesSignalTree = signal<number[]>([]);
  readonly deepSeriesNgrx = signal<number[]>([]);
  readonly arraySeriesSignalTree = signal<number[]>([]);
  readonly arraySeriesNgrx = signal<number[]>([]);
  readonly computedSeriesSignalTree = signal<number[]>([]);
  readonly computedSeriesNgrx = signal<number[]>([]);
  readonly deepNestedResult = signal<{
    signaltree: BenchmarkResult;
    ngrxSignals: BenchmarkResult;
  } | null>(null);
  readonly arrayResult = signal<{
    signaltree: BenchmarkResult;
    ngrxSignals: BenchmarkResult;
  } | null>(null);
  readonly computedResult = signal<{
    signaltree: BenchmarkResult;
    ngrxSignals: BenchmarkResult;
  } | null>(null);
  readonly allResults = signal<BenchmarkResult[]>([]);

  private beginTask(scenario: string, library: string, total: number) {
    this.currentTask.set(scenario);
    this.currentLibrary.set(library);
    this.totalIterations.set(total);
    this.currentIteration.set(0);
  }

  private tickProgress() {
    this.currentIteration.update((i) => i + 1);
  }

  // Build many-series payload for the combined graph with legend toggling
  allSeries() {
    return [
      { name: 'Deep — SignalTree', data: this.deepSeriesSignalTree() },
      { name: 'Deep — NgRx SignalStore', data: this.deepSeriesNgrx() },
      { name: 'Array — SignalTree', data: this.arraySeriesSignalTree() },
      { name: 'Array — NgRx SignalStore', data: this.arraySeriesNgrx() },
      { name: 'Computed — SignalTree', data: this.computedSeriesSignalTree() },
      { name: 'Computed — NgRx SignalStore', data: this.computedSeriesNgrx() },
    ];
  }

  private createInitialState(): DeepNestedState {
    return {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                counter: 0,
                data: 'initial',
              },
            },
          },
        },
      },
      users: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        profile: {
          settings: {
            theme: 'light',
            notifications: true,
          },
        },
      })),
      metadata: {
        version: '1.0.0',
        timestamp: Date.now(),
        config: {
          enableFeatureA: true,
          enableFeatureB: false,
          maxItems: 100,
        },
      },
    };
  }

  async runDeepNestedBenchmark(resetSeries = true) {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      // reset live series
      if (resetSeries) {
        this.deepSeriesSignalTree.set([]);
        this.deepSeriesNgrx.set([]);
      }
      const plan = this.calibration.getPlan('deepNested');
      this.beginTask('Deep Nested Updates', 'SignalTree', plan.iterations);
      // Test SignalTree deep nested updates
      const signaltreeResult = await this.benchmarkSignalTreeDeepNested(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.deepSeriesSignalTree.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );

      // Test NgRx SignalStore deep nested updates
      this.beginTask(
        'Deep Nested Updates',
        'NgRx SignalStore',
        plan.iterations
      );
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsDeepNested(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.deepSeriesNgrx.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );

      this.deepNestedResult.set({
        signaltree: signaltreeResult,
        ngrxSignals: ngrxSignalsResult,
      });
      this.allResults.update((results) => [
        ...results,
        signaltreeResult,
        ngrxSignalsResult,
      ]);
    } finally {
      this.isRunning.set(false);
    }
  }

  private async benchmarkSignalTreeDeepNested(
    innerOps = 10,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    // Deep Nested scenario mapping: batching + shallow memoization
    const tree = signalTree(initialState).with(
      withBatching(),
      withShallowMemoization()
    );

    const samples: number[] = [];
    let renderCount = 0;

    // Setup reactive computation to track renders
    const computation = computed(() => {
      const counter = tree.state.level1.level2.level3.level4.level5.counter();
      renderCount++;
      return counter;
    });

    // Warm up
    for (let i = 0; i < 10; i++) {
      tree.state.level1.level2.level3.level4.level5.counter(i);
      computation(); // Trigger computation
    }
    renderCount = 0;

    // Benchmark with multiple operations per iteration
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Perform N operations per iteration for measurable work
      for (let j = 0; j < innerOps; j++) {
        tree.state.level1.level2.level3.level4.level5.counter(i * 10 + j);
        tree.state.level1.level2.level3.level4.level5.data(`updated-${i}-${j}`);
        computation(); // Trigger computation
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Deep Nested Updates',
      library: 'SignalTree',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsDeepNested(
    innerOps = 10,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const state = signalState(initialState);

    const samples: number[] = [];
    let renderCount = 0;

    // Setup reactive computation to track renders
    const computation = computed(() => {
      const counter = state.level1().level2.level3.level4.level5.counter;
      renderCount++;
      return counter;
    });

    // Warm up
    for (let i = 0; i < 10; i++) {
      patchState(state, (state) => ({
        ...state,
        level1: {
          ...state.level1,
          level2: {
            ...state.level1.level2,
            level3: {
              ...state.level1.level2.level3,
              level4: {
                ...state.level1.level2.level3.level4,
                level5: {
                  ...state.level1.level2.level3.level4.level5,
                  counter: i,
                },
              },
            },
          },
        },
      }));
      computation(); // Trigger computation
    }
    renderCount = 0;

    // Benchmark with multiple operations per iteration
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Perform N operations per iteration for measurable work
      for (let j = 0; j < innerOps; j++) {
        patchState(state, (currentState) => ({
          ...currentState,
          level1: {
            ...currentState.level1,
            level2: {
              ...currentState.level1.level2,
              level3: {
                ...currentState.level1.level2.level3,
                level4: {
                  ...currentState.level1.level2.level3.level4,
                  level5: {
                    ...currentState.level1.level2.level3.level4.level5,
                    counter: i * 10 + j,
                    data: `updated-${i}-${j}`,
                  },
                },
              },
            },
          },
        }));
        computation(); // Trigger computation
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Deep Nested Updates',
      library: 'NgRx SignalStore',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  async runArrayBenchmark(resetSeries = true) {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      // reset live series
      if (resetSeries) {
        this.arraySeriesSignalTree.set([]);
        this.arraySeriesNgrx.set([]);
      }
      const plan = this.calibration.getPlan('arrayUpdates');
      this.beginTask('Large Array Updates', 'SignalTree', plan.iterations);
      const signaltreeResult = await this.benchmarkSignalTreeArray(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.arraySeriesSignalTree.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );
      this.beginTask(
        'Large Array Updates',
        'NgRx SignalStore',
        plan.iterations
      );
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsArray(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.arraySeriesNgrx.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );

      this.arrayResult.set({
        signaltree: signaltreeResult,
        ngrxSignals: ngrxSignalsResult,
      });
      this.allResults.update((results) => [
        ...results,
        signaltreeResult,
        ngrxSignalsResult,
      ]);
    } finally {
      this.isRunning.set(false);
    }
  }

  private async benchmarkSignalTreeArray(
    innerOps = 10,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    // Array Updates scenario mapping: high-performance batching only
    const tree = signalTree(initialState).with(withHighPerformanceBatching());

    const samples: number[] = [];
    let renderCount = 0;

    const computation = computed(() => {
      const userCount = tree.state.users().length;
      renderCount++;
      return userCount;
    });

    // Warm up
    for (let i = 0; i < 5; i++) {
      tree.state.users.update((users) => {
        users[i].name = `Warm Up User ${i}`;
        return users;
      });
      computation();
    }
    renderCount = 0;

    // Benchmark array updates with multiple operations per iteration
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Perform N operations per iteration for measurable work
      for (let j = 0; j < innerOps; j++) {
        tree.state.users.update((users) => {
          const index = (i * innerOps + j) % 100;
          users[index].name = `Updated User ${index}`;
          users[index].email = `updated${index}@example.com`;
          users[index].profile.settings.theme =
            index % 2 === 0 ? 'dark' : 'light';
          return users;
        });
        computation();
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Large Array Updates',
      library: 'SignalTree',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsArray(
    innerOps = 10,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const state = signalState(initialState);

    const samples: number[] = [];
    let renderCount = 0;

    const computation = computed(() => {
      const userCount = state.users().length;
      renderCount++;
      return userCount;
    });

    // Warm up
    for (let i = 0; i < 5; i++) {
      patchState(state, (currentState) => ({
        ...currentState,
        users: currentState.users.map((user, index) =>
          index === i ? { ...user, name: `Warm Up User ${i}` } : user
        ),
      }));
      computation();
    }
    renderCount = 0;

    // Benchmark array updates with multiple operations per iteration
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Perform N operations per iteration for measurable work
      for (let j = 0; j < innerOps; j++) {
        const index = (i * innerOps + j) % 100;
        patchState(state, (currentState) => ({
          ...currentState,
          users: currentState.users.map((user, userIndex) =>
            userIndex === index
              ? {
                  ...user,
                  name: `Updated User ${index}`,
                  email: `updated${index}@example.com`,
                  profile: {
                    ...user.profile,
                    settings: {
                      ...user.profile.settings,
                      theme: index % 2 === 0 ? 'dark' : 'light',
                    },
                  },
                }
              : user
          ),
        }));
        computation();
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Large Array Updates',
      library: 'NgRx SignalStore',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  async runComputedBenchmark(resetSeries = true) {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      // reset live series
      if (resetSeries) {
        this.computedSeriesSignalTree.set([]);
        this.computedSeriesNgrx.set([]);
      }
      const plan = this.calibration.getPlan('computedPerf');
      this.beginTask(
        'Complex Computed Performance',
        'SignalTree',
        plan.iterations
      );
      const signaltreeResult = await this.benchmarkSignalTreeComputed(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.computedSeriesSignalTree.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );
      this.beginTask(
        'Complex Computed Performance',
        'NgRx SignalStore',
        plan.iterations
      );
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsComputed(
        plan.innerOps,
        plan.iterations,
        (ms) => {
          this.computedSeriesNgrx.update((s) => [...s, ms]);
          this.tickProgress();
        }
      );

      this.computedResult.set({
        signaltree: signaltreeResult,
        ngrxSignals: ngrxSignalsResult,
      });
      this.allResults.update((results) => [
        ...results,
        signaltreeResult,
        ngrxSignalsResult,
      ]);
    } finally {
      this.isRunning.set(false);
    }
  }

  // One-click runner for all three scenarios in sequence, using calibration plans
  async runFullBattery() {
    if (this.isRunning()) return;
    if (!this.hasCalibration()) return;
    this.isRunning.set(true);
    const rounds = 3;
    try {
      for (let r = 0; r < rounds; r++) {
        const reset = r === 0;
        await this.runDeepNestedBenchmark(reset);
        await this.runArrayBenchmark(reset);
        await this.runComputedBenchmark(reset);
      }
    } finally {
      this.isRunning.set(false);
    }
  }

  private async benchmarkSignalTreeComputed(
    innerOps = 1,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    // Computed Performance scenario mapping: batching + shallow memoization
    const tree = signalTree(initialState).with(
      withBatching(),
      withShallowMemoization()
    );

    const samples: number[] = [];
    let renderCount = 0;

    // Complex computed that depends on multiple nested properties
    const complexComputed = computed(() => {
      renderCount++;
      const users = tree.state.users();
      const metadata = tree.state.metadata; // metadata is the object, not a function
      const counter = tree.state.level1.level2.level3.level4.level5.counter();

      return {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.profile.settings.notifications)
          .length,
        configSum: metadata.config.maxItems() + counter, // maxItems is the signal
        timestamp: metadata.timestamp(), // timestamp is the signal
      };
    });

    // Warm up
    for (let i = 0; i < 10; i++) {
      tree.state.level1.level2.level3.level4.level5.counter(i);
      complexComputed();
    }
    renderCount = 0;

    // Benchmark computed performance
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      tree.state.level1.level2.level3.level4.level5.counter(i);
      tree.state.metadata.config.maxItems(100 + i);
      // Read the computed multiple times to scale work
      for (let j = 0; j < innerOps; j++) {
        complexComputed();
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Complex Computed Performance',
      library: 'SignalTree',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsComputed(
    innerOps = 1,
    iterations = 100,
    onSample?: (ms: number) => void
  ): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const state = signalState(initialState);

    const samples: number[] = [];
    let renderCount = 0;

    // Complex computed that depends on multiple nested properties
    const complexComputed = computed(() => {
      renderCount++;
      const users = state.users();
      const metadata = state.metadata();
      const counter = state.level1().level2.level3.level4.level5.counter;

      return {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.profile.settings.notifications)
          .length,
        configSum: metadata.config.maxItems + counter,
        timestamp: metadata.timestamp,
      };
    });

    // Warm up
    for (let i = 0; i < 10; i++) {
      patchState(state, (currentState) => ({
        ...currentState,
        level1: {
          ...currentState.level1,
          level2: {
            ...currentState.level1.level2,
            level3: {
              ...currentState.level1.level2.level3,
              level4: {
                ...currentState.level1.level2.level3.level4,
                level5: {
                  ...currentState.level1.level2.level3.level4.level5,
                  counter: i,
                },
              },
            },
          },
        },
      }));
      complexComputed();
    }
    renderCount = 0;

    // Benchmark computed performance
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      patchState(state, (currentState) => ({
        ...currentState,
        level1: {
          ...currentState.level1,
          level2: {
            ...currentState.level1.level2,
            level3: {
              ...currentState.level1.level2.level3,
              level4: {
                ...currentState.level1.level2.level3.level4,
                level5: {
                  ...currentState.level1.level2.level3.level4.level5,
                  counter: i,
                },
              },
            },
          },
        },
        metadata: {
          ...currentState.metadata,
          config: {
            ...currentState.metadata.config,
            maxItems: 100 + i,
          },
        },
      }));
      // Read the computed multiple times to scale work
      for (let j = 0; j < innerOps; j++) {
        complexComputed();
      }

      const end = performance.now();
      const ms = end - start;
      samples.push(ms);
      onSample?.(ms);
    }

    const sorted = samples.sort((a, b) => a - b);
    const n = sorted.length;
    const low = n >= 50 ? Math.floor(n * 0.02) : 0;
    const high = n >= 50 ? Math.ceil(n * 0.98) : n;
    const trimmed = sorted.slice(low, high);
    return {
      scenario: 'Complex Computed Performance',
      library: 'NgRx SignalStore',
      p50:
        trimmed[Math.floor(trimmed.length * 0.5)] ??
        sorted[Math.floor(n * 0.5)],
      p95:
        trimmed[Math.floor(trimmed.length * 0.95)] ??
        sorted[Math.floor(n * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  getWinner(time1?: number, time2?: number): string {
    if (!time1 || !time2) return 'N/A';
    return time1 < time2 ? 'SignalTree' : 'NgRx SignalStore';
  }

  getSpeedupRatio(time1?: number, time2?: number): string {
    if (!time1 || !time2) return 'N/A';
    const ratio = Math.max(time1, time2) / Math.min(time1, time2);
    return ratio.toFixed(1);
  }

  exportResults() {
    const results = this.allResults();
    if (results.length === 0) return;

    const ndjson = results.map((result) => JSON.stringify(result)).join('\n');
    const blob = new Blob([ndjson], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-vs-ngrx-signals-benchmark-${Date.now()}.ndjson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Expose results to parent orchestrator for aggregation/export
  getResultsSnapshot() {
    return this.allResults();
  }
}
