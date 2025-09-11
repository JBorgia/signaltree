import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface TestEntity {
  id: string;
  name: string;
  value: number;
}

interface TestData {
  entities: TestEntity[];
  counter: number;
}

interface ComparisonMetrics {
  library: string;
  initTime: number;
  readTime: number;
  writeTime: number;
  subscriptionTime: number;
  memoryBefore: number;
  memoryAfter: number;
}

@Component({
  selector: 'app-library-comparison',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="comparison-container">
      <div class="comparison-header">
        <h2>🏆 Multi-Library Performance Comparison</h2>
        <p>Compare SignalTree against other state management approaches</p>

        <div class="controls">
          <button
            class="run-btn"
            (click)="runComparison()"
            [disabled]="isRunning()"
          >
            {{ isRunning() ? '🔄 Running...' : '▶️ Run Comparison' }}
          </button>

          <button
            class="clear-btn"
            (click)="clearResults()"
            [disabled]="!results() || isRunning()"
          >
            🗑️ Clear
          </button>

          <button
            class="export-btn"
            (click)="exportResults()"
            [disabled]="!results() || isRunning()"
          >
            📥 Export JSON
          </button>
        </div>
      </div>

      @if (results(); as data) {
      <div class="results-section">
        <div class="comparison-summary">
          <h3>Performance Summary</h3>
          <div class="winner-badge" [class]="getWinnerClass()">
            🥇 {{ getBestPerformer() }}
          </div>
        </div>

        <div class="metrics-table">
          <div class="table-header">
            <span>Library</span>
            <span>Init (ms)</span>
            <span>Read (ms)</span>
            <span>Write (ms)</span>
            <span>Subscribe (ms)</span>
            <span>Memory (KB)</span>
            <span>Score</span>
          </div>

          @for (result of data; track result.library) {
          <div class="table-row" [class]="getRowClass(result)">
            <span class="library-name">{{ result.library }}</span>
            <span class="metric">{{ result.initTime.toFixed(2) }}</span>
            <span class="metric">{{ result.readTime.toFixed(2) }}</span>
            <span class="metric">{{ result.writeTime.toFixed(2) }}</span>
            <span class="metric">{{ result.subscriptionTime.toFixed(2) }}</span>
            <span class="metric">{{ getMemoryDelta(result).toFixed(1) }}</span>
            <span class="score" [class]="getScoreClass(result)">
              {{ getPerformanceScore(result).toFixed(0) }}
            </span>
          </div>
          }
        </div>

        <div class="detailed-analysis">
          <h3>Detailed Analysis</h3>
          <div class="analysis-grid">
            @for (insight of getInsights(); track insight.metric) {
            <div class="insight-card">
              <h4>{{ insight.metric }}</h4>
              <p>{{ insight.description }}</p>
              <div class="improvement" [class]="insight.type">
                {{ insight.improvement }}
              </div>
            </div>
            }
          </div>
        </div>
      </div>
      } @if (error()) {
      <div class="error-message">
        <h3>❌ Error</h3>
        <p>{{ error() }}</p>
      </div>
      }
    </div>
  `,
  styles: [
    `
      .comparison-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .comparison-header {
        text-align: center;
        margin-bottom: 30px;
      }

      .controls {
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
      }

      .controls button {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .run-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .clear-btn {
        background: #f56565;
        color: white;
      }

      .export-btn {
        background: #48bb78;
        color: white;
      }

      .controls button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .comparison-summary {
        text-align: center;
        margin-bottom: 30px;
      }

      .winner-badge {
        display: inline-block;
        padding: 10px 20px;
        border-radius: 25px;
        font-weight: bold;
        margin-top: 10px;
      }

      .winner-badge.signaltree {
        background: #e6fffa;
        color: #00b894;
      }
      .winner-badge.native {
        background: #fff5f5;
        color: #e53e3e;
      }
      .winner-badge.simple {
        background: #fffaf0;
        color: #dd6b20;
      }

      .metrics-table {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
        gap: 1px;
        background: #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 30px;
      }

      .table-header {
        display: contents;
      }

      .table-header span {
        background: #4a5568;
        color: white;
        padding: 15px;
        font-weight: 600;
      }

      .table-row {
        display: contents;
      }

      .table-row span {
        background: white;
        padding: 12px 15px;
        border-bottom: 1px solid #e2e8f0;
      }

      .table-row.best {
        background: #f0fff4;
      }
      .table-row.worst {
        background: #fef5e7;
      }

      .library-name {
        font-weight: 600;
      }
      .metric {
        text-align: center;
        font-family: monospace;
      }
      .score {
        text-align: center;
        font-weight: bold;
      }
      .score.excellent {
        color: #00b894;
      }
      .score.good {
        color: #fdcb6e;
      }
      .score.poor {
        color: #e17055;
      }

      .analysis-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
      }

      .insight-card {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .insight-card h4 {
        margin: 0 0 10px 0;
        color: #2d3748;
      }

      .improvement {
        font-weight: bold;
        margin-top: 10px;
      }

      .improvement.positive {
        color: #00b894;
      }
      .improvement.negative {
        color: #e17055;
      }
      .improvement.neutral {
        color: #6c757d;
      }

      .error-message {
        background: #fed7d7;
        border: 1px solid #feb2b2;
        color: #c53030;
        padding: 20px;
        border-radius: 8px;
        text-align: center;
      }
    `,
  ],
})
export class LibraryComparisonComponent {
  isRunning = signal(false);
  results = signal<ComparisonMetrics[] | null>(null);
  error = signal<string | null>(null);

  async runComparison(): Promise<void> {
    this.isRunning.set(true);
    this.error.set(null);
    this.results.set(null);

    try {
      const entityCount = 1000;
      const testData = this.generateTestData(entityCount);

      const results: ComparisonMetrics[] = [];

      // Test SignalTree
      results.push(await this.benchmarkSignalTree(testData));

      // Test Native Angular Signals
      results.push(await this.benchmarkNativeSignals(testData));

      // Test Simple Object State (baseline)
      results.push(await this.benchmarkSimpleState(testData));

      this.results.set(results);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Unknown error occurred'
      );
    } finally {
      this.isRunning.set(false);
    }
  }

  private async benchmarkSignalTree(
    testData: TestData
  ): Promise<ComparisonMetrics> {
    const memoryBefore = this.getMemoryUsage();

    // Initialization
    const initStart = performance.now();
    const store = signalTree(testData);
    const initTime = performance.now() - initStart;

    // Read performance - accessing signals
    const readStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      // Access through signal API
      const state = (store as unknown as { $: () => TestData }).$();
      if (state?.entities?.[0]) {
        const name = state.entities[0].name;
        // Use the value to prevent optimization
        if (name) continue;
      }
    }
    const readTime = performance.now() - readStart;

    // Write performance
    const writeStart = performance.now();
    for (let i = 0; i < 100; i++) {
      (
        store as unknown as {
          update: (fn: (current: TestData) => TestData) => void;
        }
      ).update((current: TestData) => ({
        ...current,
        counter: current.counter + 1,
      }));
    }
    const writeTime = performance.now() - writeStart;

    // Subscription performance
    let updateCount = 0;
    const subscriptionStart = performance.now();

    const effectRef = effect(() => {
      // Access counter to trigger effect
      const counterValue = (store as unknown as { $: () => TestData }).$()
        .counter;
      // Use the value to prevent tree-shaking
      if (counterValue !== undefined) {
        updateCount = updateCount + 1;
      }
    });

    // Trigger updates
    for (let i = 0; i < 50; i++) {
      (
        store as unknown as {
          update: (fn: (current: TestData) => TestData) => void;
        }
      ).update((current: TestData) => ({
        ...current,
        counter: current.counter + 1,
      }));
    }

    const subscriptionTime = performance.now() - subscriptionStart;
    effectRef.destroy();

    const memoryAfter = this.getMemoryUsage();

    return {
      library: 'SignalTree',
      initTime,
      readTime,
      writeTime,
      subscriptionTime,
      memoryBefore,
      memoryAfter,
    };
  }

  private async benchmarkNativeSignals(
    testData: TestData
  ): Promise<ComparisonMetrics> {
    const memoryBefore = this.getMemoryUsage();

    // Initialization
    const initStart = performance.now();
    const store = signal(testData);
    const initTime = performance.now() - initStart;

    // Read performance
    const readStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      const state = store();
      if (state?.entities?.[0]) {
        const name = state.entities[0].name;
        // Use the value to prevent optimization
        if (name) continue;
      }
    }
    const readTime = performance.now() - readStart;

    // Write performance
    const writeStart = performance.now();
    for (let i = 0; i < 100; i++) {
      store.update((current) => ({
        ...current,
        counter: current.counter + 1,
      }));
    }
    const writeTime = performance.now() - writeStart;

    // Subscription performance
    let updateCount = 0;
    const subscriptionStart = performance.now();

    const counterSignal = computed(() => store().counter);
    const effectRef = effect(() => {
      const counterValue = counterSignal();
      // Use the value to ensure effect triggers
      if (counterValue !== undefined) {
        updateCount = updateCount + 1;
      }
    });

    // Trigger updates
    for (let i = 0; i < 50; i++) {
      store.update((current) => ({
        ...current,
        counter: current.counter + 1,
      }));
    }

    const subscriptionTime = performance.now() - subscriptionStart;
    effectRef.destroy();

    const memoryAfter = this.getMemoryUsage();

    return {
      library: 'Native Angular Signals',
      initTime,
      readTime,
      writeTime,
      subscriptionTime,
      memoryBefore,
      memoryAfter,
    };
  }

  private async benchmarkSimpleState(
    testData: TestData
  ): Promise<ComparisonMetrics> {
    const memoryBefore = this.getMemoryUsage();

    // Initialization
    const initStart = performance.now();
    let state = { ...testData };
    const listeners: Array<() => void> = [];
    const initTime = performance.now() - initStart;

    // Read performance
    const readStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      if (state?.entities?.[0]) {
        const name = state.entities[0].name;
        // Use the value to prevent optimization
        if (name) continue;
      }
    }
    const readTime = performance.now() - readStart;

    // Write performance
    const writeStart = performance.now();
    for (let i = 0; i < 100; i++) {
      state = {
        ...state,
        counter: state.counter + 1,
      };
      // Notify listeners
      listeners.forEach((listener) => listener());
    }
    const writeTime = performance.now() - writeStart;

    // Subscription performance
    let updateCount = 0;
    const subscriptionStart = performance.now();

    const listener = () => {
      const counterValue = state.counter;
      // Use the value to ensure listener triggers
      if (counterValue !== undefined) {
        updateCount = updateCount + 1;
      }
    };
    listeners.push(listener);

    // Trigger updates
    for (let i = 0; i < 50; i++) {
      state = {
        ...state,
        counter: state.counter + 1,
      };
      listeners.forEach((l) => l());
    }

    const subscriptionTime = performance.now() - subscriptionStart;

    const memoryAfter = this.getMemoryUsage();

    return {
      library: 'Simple State (Baseline)',
      initTime,
      readTime,
      writeTime,
      subscriptionTime,
      memoryBefore,
      memoryAfter,
    };
  }

  private generateTestData(entityCount: number): TestData {
    return {
      entities: Array.from({ length: entityCount }, (_, i) => ({
        id: `entity-${i}`,
        name: `Entity ${i}`,
        value: i,
      })),
      counter: 0,
    };
  }

  private getMemoryUsage(): number {
    try {
      const memoryInfo = (
        performance as { memory?: { usedJSHeapSize?: number } }
      ).memory;
      return memoryInfo?.usedJSHeapSize || 0;
    } catch {
      return 0;
    }
  }

  getBestPerformer(): string {
    const results = this.results();
    if (!results || results.length === 0) return '';

    const scores = results.map((r) => ({
      library: r.library,
      score: this.getPerformanceScore(r),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores[0].library;
  }

  getWinnerClass(): string {
    const winner = this.getBestPerformer().toLowerCase();
    if (winner.includes('signaltree')) return 'signaltree';
    if (winner.includes('native')) return 'native';
    return 'simple';
  }

  getRowClass(result: ComparisonMetrics): string {
    const results = this.results();
    if (!results) return '';

    const scores = results.map((r) => this.getPerformanceScore(r));
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const currentScore = this.getPerformanceScore(result);

    if (currentScore === maxScore) return 'best';
    if (currentScore === minScore) return 'worst';
    return '';
  }

  getScoreClass(result: ComparisonMetrics): string {
    const score = this.getPerformanceScore(result);
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'poor';
  }

  getMemoryDelta(result: ComparisonMetrics): number {
    return (result.memoryAfter - result.memoryBefore) / 1024; // Convert to KB
  }

  getPerformanceScore(result: ComparisonMetrics): number {
    // Simple scoring algorithm - lower times = higher scores
    const totalTime =
      result.initTime +
      result.readTime +
      result.writeTime +
      result.subscriptionTime;
    const memoryUsage = this.getMemoryDelta(result);

    // Normalize and combine (lower is better for both time and memory)
    const timeScore = Math.max(0, 100 - totalTime / 10); // Rough normalization
    const memoryScore = Math.max(0, 100 - memoryUsage / 100); // Rough normalization

    return timeScore * 0.7 + memoryScore * 0.3; // Weight time more heavily
  }

  getInsights() {
    const results = this.results();
    if (!results || results.length < 2) return [];

    const signalTreeResult = results.find((r) => r.library === 'SignalTree');
    const nativeResult = results.find((r) => r.library.includes('Native'));

    if (!signalTreeResult || !nativeResult) return [];

    const insights = [];

    // Init time comparison
    const initImprovement =
      ((nativeResult.initTime - signalTreeResult.initTime) /
        nativeResult.initTime) *
      100;
    insights.push({
      metric: 'Initialization',
      description: 'Time to create and set up the store with initial data',
      improvement:
        initImprovement > 0
          ? `${initImprovement.toFixed(1)}% faster than native signals`
          : `${Math.abs(initImprovement).toFixed(
              1
            )}% slower than native signals`,
      type: initImprovement > 0 ? 'positive' : 'negative',
    });

    // Read performance comparison
    const readImprovement =
      ((nativeResult.readTime - signalTreeResult.readTime) /
        nativeResult.readTime) *
      100;
    insights.push({
      metric: 'Read Performance',
      description: 'Time to access and read values from the store',
      improvement:
        readImprovement > 0
          ? `${readImprovement.toFixed(1)}% faster reads`
          : `${Math.abs(readImprovement).toFixed(1)}% slower reads`,
      type: readImprovement > 0 ? 'positive' : 'negative',
    });

    // Write performance comparison
    const writeImprovement =
      ((nativeResult.writeTime - signalTreeResult.writeTime) /
        nativeResult.writeTime) *
      100;
    insights.push({
      metric: 'Write Performance',
      description: 'Time to update and write values to the store',
      improvement:
        writeImprovement > 0
          ? `${writeImprovement.toFixed(1)}% faster updates`
          : `${Math.abs(writeImprovement).toFixed(1)}% slower updates`,
      type: writeImprovement > 0 ? 'positive' : 'negative',
    });

    return insights;
  }

  clearResults(): void {
    this.results.set(null);
    this.error.set(null);
  }

  exportResults(): void {
    const results = this.results();
    if (!results) return;

    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory:
          (navigator as { deviceMemory?: number }).deviceMemory || 'unknown',
      },
      results,
      analysis: {
        winner: this.getBestPerformer(),
        insights: this.getInsights(),
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-library-comparison-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
