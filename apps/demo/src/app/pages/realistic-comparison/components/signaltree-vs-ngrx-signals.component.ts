import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';
import { withBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';

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
  imports: [CommonModule],
  template: `
    <div class="comparison-section">
      <h3>SignalTree vs NgRx SignalStore</h3>
      <p>
        Comparing modern state management: SignalTree's direct mutation with
        batching vs NgRx SignalStore's immutable updates
      </p>

      <div class="benchmarks">
        <div class="benchmark-group">
          <h4>Deep Nested Updates Performance</h4>
          <button (click)="runDeepNestedBenchmark()" [disabled]="isRunning()">
            {{ isRunning() ? 'Running...' : 'Run Deep Nested Benchmark' }}
          </button>
          <div *ngIf="deepNestedResult() as result" class="results">
            <div class="result-item">
              <strong>SignalTree:</strong> p50: {{ result.signaltree.p50 }}ms,
              p95: {{ result.signaltree.p95 }}ms
            </div>
            <div class="result-item">
              <strong>NgRx SignalStore:</strong> p50:
              {{ result.ngrxSignals.p50 }}ms, p95:
              {{ result.ngrxSignals.p95 }}ms
            </div>
            <div class="performance-analysis">
              <strong>Winner:</strong>
              {{ getWinner(result.signaltree.p50, result.ngrxSignals.p50) }}
              ({{
                getSpeedupRatio(result.signaltree.p50, result.ngrxSignals.p50)
              }}x faster)
            </div>
          </div>
        </div>

        <div class="benchmark-group">
          <h4>Large Array Updates Performance</h4>
          <button (click)="runArrayBenchmark()" [disabled]="isRunning()">
            {{ isRunning() ? 'Running...' : 'Run Array Benchmark' }}
          </button>
          <div *ngIf="arrayResult() as result" class="results">
            <div class="result-item">
              <strong>SignalTree:</strong> p50: {{ result.signaltree.p50 }}ms,
              p95: {{ result.signaltree.p95 }}ms
            </div>
            <div class="result-item">
              <strong>NgRx SignalStore:</strong> p50:
              {{ result.ngrxSignals.p50 }}ms, p95:
              {{ result.ngrxSignals.p95 }}ms
            </div>
            <div class="performance-analysis">
              <strong>Winner:</strong>
              {{ getWinner(result.signaltree.p50, result.ngrxSignals.p50) }}
              ({{
                getSpeedupRatio(result.signaltree.p50, result.ngrxSignals.p50)
              }}x faster)
            </div>
          </div>
        </div>

        <div class="benchmark-group">
          <h4>Computed/Derived Performance</h4>
          <button (click)="runComputedBenchmark()" [disabled]="isRunning()">
            {{ isRunning() ? 'Running...' : 'Run Computed Benchmark' }}
          </button>
          <div *ngIf="computedResult() as result" class="results">
            <div class="result-item">
              <strong>SignalTree:</strong> p50: {{ result.signaltree.p50 }}ms,
              p95: {{ result.signaltree.p95 }}ms
            </div>
            <div class="result-item">
              <strong>NgRx SignalStore:</strong> p50:
              {{ result.ngrxSignals.p50 }}ms, p95:
              {{ result.ngrxSignals.p95 }}ms
            </div>
            <div class="performance-analysis">
              <strong>Winner:</strong>
              {{ getWinner(result.signaltree.p50, result.ngrxSignals.p50) }}
              ({{
                getSpeedupRatio(result.signaltree.p50, result.ngrxSignals.p50)
              }}x faster)
            </div>
          </div>
        </div>
      </div>

      <div class="all-results" *ngIf="allResults().length > 0">
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
          <div class="table-row" *ngFor="let result of allResults()">
            <span>{{ result.scenario }}</span>
            <span>{{ result.library }}</span>
            <span>{{ result.p50 }}</span>
            <span>{{ result.p95 }}</span>
            <span>{{ result.samples.length }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
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
    `,
  ],
})
export class SignalTreeVsNgrxSignalsComponent {
  readonly isRunning = signal(false);
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

  async runDeepNestedBenchmark() {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      // Test SignalTree deep nested updates
      const signaltreeResult = await this.benchmarkSignalTreeDeepNested();

      // Test NgRx SignalStore deep nested updates
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsDeepNested();

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

  private async benchmarkSignalTreeDeepNested(): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const tree = signalTree(initialState).with(
      withBatching(),
      withMemoization()
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
    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      // Perform 10 operations per iteration for measurable work
      for (let j = 0; j < 10; j++) {
        tree.state.level1.level2.level3.level4.level5.counter(i * 10 + j);
        tree.state.level1.level2.level3.level4.level5.data(`updated-${i}-${j}`);
        computation(); // Trigger computation
      }

      const end = performance.now();
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Deep Nested Updates',
      library: 'SignalTree',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsDeepNested(): Promise<BenchmarkResult> {
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
    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      // Perform 10 operations per iteration for measurable work
      for (let j = 0; j < 10; j++) {
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
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Deep Nested Updates',
      library: 'NgRx SignalStore',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  async runArrayBenchmark() {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      const signaltreeResult = await this.benchmarkSignalTreeArray();
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsArray();

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

  private async benchmarkSignalTreeArray(): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const tree = signalTree(initialState).with(
      withBatching(),
      withMemoization()
    );

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
    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      // Perform 10 operations per iteration for measurable work
      for (let j = 0; j < 10; j++) {
        tree.state.users.update((users) => {
          const index = (i * 10 + j) % 100;
          users[index].name = `Updated User ${index}`;
          users[index].email = `updated${index}@example.com`;
          users[index].profile.settings.theme =
            index % 2 === 0 ? 'dark' : 'light';
          return users;
        });
        computation();
      }

      const end = performance.now();
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Large Array Updates',
      library: 'SignalTree',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsArray(): Promise<BenchmarkResult> {
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
    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      // Perform 10 operations per iteration for measurable work
      for (let j = 0; j < 10; j++) {
        const index = (i * 10 + j) % 100;
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
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Large Array Updates',
      library: 'NgRx SignalStore',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  async runComputedBenchmark() {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    try {
      const signaltreeResult = await this.benchmarkSignalTreeComputed();
      const ngrxSignalsResult = await this.benchmarkNgrxSignalsComputed();

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

  private async benchmarkSignalTreeComputed(): Promise<BenchmarkResult> {
    const initialState = this.createInitialState();
    const tree = signalTree(initialState).with(
      withBatching(),
      withMemoization()
    );

    const samples: number[] = [];
    let renderCount = 0;

    // Complex computed that depends on multiple nested properties
    const complexComputed = computed(() => {
      renderCount++;
      const users = tree.state.users();
      const metadata = tree.state.metadata();
      const counter = tree.state.level1.level2.level3.level4.level5.counter();

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
      tree.state.level1.level2.level3.level4.level5.counter(i);
      complexComputed();
    }
    renderCount = 0;

    // Benchmark computed performance
    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      tree.state.level1.level2.level3.level4.level5.counter(i);
      tree.state.metadata.config.maxItems(100 + i);
      complexComputed(); // Read the computed value

      const end = performance.now();
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Complex Computed Performance',
      library: 'SignalTree',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples,
      renderCount,
      timestamp: new Date().toISOString(),
    };
  }

  private async benchmarkNgrxSignalsComputed(): Promise<BenchmarkResult> {
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
    for (let i = 0; i < 100; i++) {
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
      complexComputed(); // Read the computed value

      const end = performance.now();
      samples.push(end - start);
    }

    const sorted = samples.sort((a, b) => a - b);
    return {
      scenario: 'Complex Computed Performance',
      library: 'NgRx SignalStore',
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
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
}
