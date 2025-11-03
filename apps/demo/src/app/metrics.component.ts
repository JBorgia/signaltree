import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';

import { BenchmarkService } from './services/benchmarks.service';

interface BenchmarkResults {
  initialization: {
    small: { nodes: number; time: number; memory: number };
    medium: { nodes: number; time: number; memory: number };
    large: { nodes: number; time: number; memory: number };
    xlarge: { nodes: number; time: number; memory: number };
  };
  updates: {
    shallow: number;
    medium: number;
    deep: number;
  };
  lazyLoading: {
    eager: { memory: number; accessTime: number };
    lazy: { memory: number; accessTime: number; secondAccess: number };
  };
}

interface ComparisonResults {
  signalTree: { init: number; update: number; memory: number };
  nativeSignals: { init: number; update: number; memory: number };
}

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="metrics-container" data-testid="benchmark-ready">
      <!-- Reliability Assessment -->
      <div class="reliability-banner" [class]="getReliabilityClass()">
        <div class="reliability-score">
          <span class="score">{{ reliabilityScore() }}/100</span>
          <span class="label">Reliability Score</span>
        </div>
        <div class="reliability-details">
          <div *ngIf="reliabilityWarnings().length > 0" class="warnings">
            <h4>⚠️ Environment Warnings:</h4>
            <ul>
              <li *ngFor="let warning of reliabilityWarnings()">
                {{ warning }}
              </li>
            </ul>
            <p>
              <small
                >Results may be less accurate. For best results, close DevTools,
                focus this tab, and ensure stable power.</small
              >
            </p>
          </div>
          <div *ngIf="reliabilityWarnings().length === 0" class="optimal">
            ✅ Optimal environment for reliable benchmarks
          </div>
        </div>
      </div>

      <div class="header">
        <h1>🚀 SignalTree Performance Metrics</h1>
        <p class="subtitle">Real-time benchmarks and performance analysis</p>

        <div class="controls">
          <button
            class="run-btn"
            [class.running]="isRunning()"
            (click)="runBenchmarks()"
            [disabled]="isRunning()"
          >
            {{ isRunning() ? 'Running...' : 'Run All Benchmarks' }}
          </button>
          <!-- Action Buttons -->
          <div class="controls">
            <button
              class="run-btn"
              [class.running]="isRunning()"
              (click)="runBenchmarks()"
              [disabled]="isRunning()"
            >
              {{ isRunning() ? '🔄 Running...' : '▶️ Run Benchmarks' }}
            </button>

            <button
              class="clear-btn"
              (click)="clearResults()"
              [disabled]="isRunning()"
            >
              Clear Results
            </button>

            <button
              class="export-btn"
              (click)="exportResults()"
              [disabled]="!results() || isRunning()"
            >
              Export JSON
            </button>
          </div>
          @if (results(); as data) {
          <div class="results-grid">
            <!-- Performance Overview -->
            <div class="metric-card overview">
              <h2>📊 Performance Overview</h2>
              <div class="overview-grid">
                <div class="overview-item">
                  <span class="label">Overall Grade</span>
                  <span class="value grade-{{ getPerformanceGrade() }}">{{
                    getPerformanceGrade()
                  }}</span>
                </div>
                <div class="overview-item">
                  <span class="label">Memory Efficiency</span>
                  <span class="value">{{ getMemoryEfficiency() }}%</span>
                </div>
                <div class="overview-item">
                  <span class="label">Lazy Loading Benefit</span>
                  <span class="value">{{ getLazyLoadingBenefit() }}x</span>
                </div>
                <div class="overview-item">
                  <span class="label">Benchmark Date</span>
                  <span class="value">{{ getTimestamp() }}</span>
                </div>
              </div>
            </div>

            <!-- Initialization Performance -->
            <div class="metric-card">
              <h2>🚀 Initialization Performance</h2>
              <div class="chart-container">
                <div class="bar-chart">
                  @for (item of getInitializationData(); track item.label) {
                  <div class="bar-item">
                    <div class="bar-label">{{ item.label }}</div>
                    <div class="bar-wrapper">
                      <div
                        class="bar"
                        [style.width.%]="item.percentage"
                        [class]="getPerformanceClass(item.value)"
                      ></div>
                      <span class="bar-value"
                        >{{ item.value.toFixed(3) }}ms</span
                      >
                    </div>
                  </div>
                  }
                </div>
              </div>
            </div>

            <!-- Update Performance -->
            <div class="metric-card">
              <h2>⚡ Update Performance</h2>
              <div class="performance-grid">
                <div class="perf-item">
                  <span class="perf-label">Shallow Update</span>
                  <span
                    class="perf-value"
                    [class]="getPerformanceClass(data.updates.shallow)"
                  >
                    {{ data.updates.shallow.toFixed(3) }}ms
                  </span>
                </div>
                <div class="perf-item">
                  <span class="perf-label">Medium Depth</span>
                  <span
                    class="perf-value"
                    [class]="getPerformanceClass(data.updates.medium)"
                  >
                    {{ data.updates.medium.toFixed(3) }}ms
                  </span>
                </div>
                <div class="perf-item">
                  <span class="perf-label">Deep Update</span>
                  <span
                    class="perf-value"
                    [class]="getPerformanceClass(data.updates.deep)"
                  >
                    {{ data.updates.deep.toFixed(3) }}ms
                  </span>
                </div>
              </div>
            </div>

            <!-- Memory Efficiency -->
            <div class="metric-card">
              <h2>💾 Memory Efficiency</h2>
              <div class="memory-comparison">
                <div class="memory-item">
                  <h3>Eager Loading</h3>
                  <div class="memory-bar">
                    <div class="memory-usage eager" [style.width.%]="100"></div>
                  </div>
                  <span class="memory-value">{{
                    formatMemory(data.lazyLoading.eager.memory)
                  }}</span>
                </div>
                <div class="memory-item">
                  <h3>Lazy Loading</h3>
                  <div class="memory-bar">
                    <div
                      class="memory-usage lazy"
                      [style.width.%]="getLazyMemoryPercentage()"
                    ></div>
                  </div>
                  <span class="memory-value">{{
                    formatMemory(data.lazyLoading.lazy.memory)
                  }}</span>
                </div>
                <div class="memory-savings">
                  <strong>Memory Saved: {{ getMemorySavings() }}%</strong>
                </div>
              </div>
            </div>

            <!-- Comparison with Alternatives -->
            <div class="metric-card comparison">
              <h2>📈 Library Comparison</h2>
              @if (comparisonData(); as comparison) {
              <div class="comparison-grid">
                <div class="comparison-header">
                  <span>Metric</span>
                  <span>SignalTree</span>
                  <span>Native Signals</span>
                  <span>Advantage</span>
                </div>
                <div class="comparison-row">
                  <span>Initialization</span>
                  <span>{{ comparison.signalTree.init.toFixed(3) }}ms</span>
                  <span>{{ comparison.nativeSignals.init.toFixed(3) }}ms</span>
                  <span
                    class="advantage"
                    [class]="
                      getAdvantageClass(
                        comparison.signalTree.init /
                          comparison.nativeSignals.init
                      )
                    "
                  >
                    {{
                      (
                        comparison.signalTree.init /
                        comparison.nativeSignals.init
                      ).toFixed(2)
                    }}x
                  </span>
                </div>
                <div class="comparison-row">
                  <span>Update Speed</span>
                  <span>{{ comparison.signalTree.update.toFixed(3) }}ms</span>
                  <span
                    >{{ comparison.nativeSignals.update.toFixed(3) }}ms</span
                  >
                  <span
                    class="advantage"
                    [class]="
                      getAdvantageClass(
                        comparison.signalTree.update /
                          comparison.nativeSignals.update
                      )
                    "
                  >
                    {{
                      (
                        comparison.signalTree.update /
                        comparison.nativeSignals.update
                      ).toFixed(2)
                    }}x
                  </span>
                </div>
                <div class="comparison-row">
                  <span>Memory Usage</span>
                  <span>{{ formatMemory(comparison.signalTree.memory) }}</span>
                  <span>{{
                    formatMemory(comparison.nativeSignals.memory)
                  }}</span>
                  <span
                    class="advantage"
                    [class]="
                      getAdvantageClass(
                        comparison.signalTree.memory /
                          comparison.nativeSignals.memory
                      )
                    "
                  >
                    {{
                      (
                        comparison.signalTree.memory /
                        comparison.nativeSignals.memory
                      ).toFixed(2)
                    }}x
                  </span>
                </div>
              </div>
              }
            </div>

            <!-- System Information -->
            <div class="metric-card system-info">
              <h2>🖥️ System Information</h2>
              <div class="system-grid">
                <div class="system-item">
                  <span class="system-label">Browser</span>
                  <span class="system-value">{{ getBrowserInfo() }}</span>
                </div>
                <div class="system-item">
                  <span class="system-label">Memory Available</span>
                  <span class="system-value">{{ getCurrentMemory() }}</span>
                </div>
                <div class="system-item">
                  <span class="system-label">Timing API</span>
                  <span class="system-value">{{
                    hasHighResTimer() ? '✅ High Resolution' : '⚠️ Standard'
                  }}</span>
                </div>
              </div>
            </div>
          </div>
          } @else {
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <h2>Ready to Benchmark</h2>
            <p>
              Click "Run Benchmarks" to measure SignalTree's performance in your
              browser.
            </p>
            <ul class="benchmark-list">
              <li>🚀 Initialization speed with different tree sizes</li>
              <li>⚡ Update performance at various depths</li>
              <li>💾 Memory efficiency with lazy loading</li>
              <li>🔄 Effect execution performance</li>
              <li>📈 Comparison with native Angular signals</li>
            </ul>
          </div>
          } @if (error()) {
          <div class="error-state">
            <h3>❌ Benchmark Failed</h3>
            <p>{{ error() }}</p>
            <button (click)="clearError()">Try Again</button>
          </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .metrics-container {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .header {
        text-align: center;
        margin-bottom: 3rem;
      }

      .header h1 {
        font-size: 2.5rem;
        margin: 0 0 0.5rem 0;
        background: linear-gradient(
          135deg,
          var(--color-primary-500) 0%,
          var(--color-purple-600) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .subtitle {
        font-size: 1.1rem;
        color: var(--color-neutral-500);
        margin: 0 0 2rem 0;
      }

      .controls {
        display: flex;
        gap: 1rem;
        justify-content: center;
      }

      .run-btn,
      .clear-btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .run-btn {
        background: linear-gradient(
          135deg,
          var(--color-primary-500) 0%,
          var(--color-purple-600) 100%
        );
        color: white;
      }

      .run-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }

      .run-btn.running {
        background: var(--color-neutral-400);
        cursor: not-allowed;
      }

      .clear-btn {
        background: var(--color-neutral-100);
        color: var(--color-neutral-700);
        border: 1px solid var(--color-neutral-300);
      }

      .clear-btn:hover:not(:disabled) {
        background: var(--color-neutral-200);
      }

      .results-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 1.5rem;
      }

      .metric-card {
        background: white;
        border-radius: 1rem;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--color-neutral-200);
      }

      .metric-card h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: var(--color-neutral-900);
      }

      .overview {
        grid-column: 1 / -1;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }

      .overview-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
        background: var(--color-neutral-50);
        border-radius: 0.5rem;
      }

      .overview-item .label {
        font-size: 0.875rem;
        color: var(--color-neutral-500);
        margin-bottom: 0.5rem;
      }

      .overview-item .value {
        font-size: 1.5rem;
        font-weight: 700;
      }

      .grade-A-plus {
        color: var(--color-secondary-600);
      }
      .grade-A {
        color: var(--color-secondary-700);
      }
      .grade-B {
        color: var(--color-warning-600);
      }
      .grade-C {
        color: var(--color-error-500);
      }

      .bar-chart {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .bar-item {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .bar-label {
        min-width: 80px;
        font-size: 0.875rem;
        color: var(--color-neutral-500);
      }

      .bar-wrapper {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .bar {
        height: 20px;
        border-radius: 10px;
        min-width: 4px;
        transition: width 0.5s ease;
      }

      .bar.excellent {
        background: var(--color-secondary-600);
      }
      .bar.good {
        background: var(--color-secondary-700);
      }
      .bar.average {
        background: var(--color-warning-600);
      }
      .bar.poor {
        background: var(--color-error-500);
      }

      .bar-value {
        font-size: 0.875rem;
        font-weight: 600;
        min-width: 60px;
      }

      .performance-grid,
      .effects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
      }

      .perf-item,
      .effect-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
        background: var(--color-neutral-50);
        border-radius: 0.5rem;
      }

      .perf-label,
      .effect-label {
        font-size: 0.875rem;
        color: var(--color-neutral-500);
        margin-bottom: 0.5rem;
      }

      .perf-value,
      .effect-value {
        font-size: 1.25rem;
        font-weight: 700;
      }

      .perf-value.excellent,
      .effect-value.excellent {
        color: var(--color-secondary-600);
      }
      .perf-value.good,
      .effect-value.good {
        color: var(--color-secondary-700);
      }
      .perf-value.average,
      .effect-value.average {
        color: var(--color-warning-600);
      }
      .perf-value.poor,
      .effect-value.poor {
        color: var(--color-error-500);
      }

      .memory-comparison {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .memory-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .memory-item h3 {
        margin: 0;
        font-size: 1rem;
        color: var(--color-neutral-700);
      }

      .memory-bar {
        height: 20px;
        background: var(--color-neutral-200);
        border-radius: 10px;
        overflow: hidden;
      }

      .memory-usage {
        height: 100%;
        transition: width 0.5s ease;
      }

      .memory-usage.eager {
        background: var(--color-error-500);
      }
      .memory-usage.lazy {
        background: var(--color-secondary-600);
      }

      /* Reliability Assessment Styles */
      .reliability-banner {
        margin-bottom: 2rem;
        padding: 1.5rem;
        border-radius: 0.75rem;
        border: 2px solid;
        display: flex;
        gap: 1.5rem;
        align-items: flex-start;
      }

      .reliability-banner.reliability-good {
        background: var(--color-secondary-50);
        border-color: var(--color-secondary-300);
      }

      .reliability-banner.reliability-fair {
        background: var(--color-warning-50);
        border-color: var(--color-warning-300);
      }

      .reliability-banner.reliability-poor {
        background: var(--color-error-50);
        border-color: var(--color-error-300);
      }

      .reliability-score {
        text-align: center;
        min-width: 120px;
      }

      .reliability-score .score {
        display: block;
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-neutral-900);
      }

      .reliability-score .label {
        display: block;
        font-size: 0.875rem;
        color: var(--color-neutral-600);
        margin-top: 0.25rem;
      }

      .reliability-details {
        flex: 1;
      }

      .reliability-details .warnings ul {
        margin: 0.5rem 0;
        padding-left: 1.25rem;
      }

      .reliability-details .warnings li {
        margin-bottom: 0.25rem;
        color: var(--color-warning-800);
      }

      .reliability-details .optimal {
        color: var(--color-secondary-700);
        font-weight: 500;
      }

      .export-btn {
        padding: 0.75rem 1.5rem;
        border: 1px solid var(--color-neutral-300);
        background: var(--color-neutral-100);
        color: var(--color-neutral-700);
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .export-btn:hover:not(:disabled) {
        background: var(--color-neutral-200);
      }

      .export-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .memory-value {
        font-size: 0.875rem;
        color: #6b7280;
      }

      .memory-savings {
        text-align: center;
        padding: 1rem;
        background: #ecfdf5;
        border-radius: 0.5rem;
        color: #065f46;
      }

      .comparison {
        grid-column: 1 / -1;
      }

      .comparison-grid {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 0.5rem;
        align-items: center;
      }

      .comparison-header {
        display: contents;
        font-weight: 600;
        color: #374151;
      }

      .comparison-row {
        display: contents;
      }

      .comparison-row > span {
        padding: 0.75rem 0.5rem;
        border-bottom: 1px solid #e5e7eb;
      }

      .advantage.better {
        color: #10b981;
        font-weight: 600;
      }
      .advantage.worse {
        color: #ef4444;
        font-weight: 600;
      }
      .advantage.similar {
        color: #6b7280;
      }

      .system-info {
        grid-column: 1 / -1;
      }

      .system-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
      }

      .system-item {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem;
        background: #f9fafb;
        border-radius: 0.5rem;
      }

      .system-label {
        color: #6b7280;
      }

      .system-value {
        font-weight: 600;
        color: #374151;
      }

      .empty-state {
        text-align: center;
        padding: 4rem 2rem;
      }

      .empty-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
      }

      .empty-state h2 {
        font-size: 1.5rem;
        margin: 0 0 1rem 0;
        color: #1f2937;
      }

      .empty-state p {
        color: #6b7280;
        margin-bottom: 2rem;
      }

      .benchmark-list {
        list-style: none;
        padding: 0;
        display: inline-block;
        text-align: left;
      }

      .benchmark-list li {
        margin: 0.5rem 0;
        color: #374151;
      }

      .error-state {
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-top: 1rem;
      }

      .error-state h3 {
        color: #dc2626;
        margin: 0 0 0.5rem 0;
      }

      .error-state p {
        color: #7f1d1d;
        margin: 0 0 1rem 0;
      }

      .error-state button {
        background: #dc2626;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
      }
    `,
  ],
})
export class MetricsComponent implements OnInit {
  private benchmarkService = inject(BenchmarkService);

  results = signal<BenchmarkResults | null>(null);
  comparisonData = signal<ComparisonResults | null>(null);
  isRunning = signal(false);
  error = signal<string | null>(null);

  // Reliability tracking
  reliabilityScore = signal(100);
  reliabilityWarnings = signal<string[]>([]);

  ngOnInit() {
    this.updateReliabilityAssessment();

    // Update reliability every 5 seconds
    setInterval(() => {
      this.updateReliabilityAssessment();
    }, 5000);

    // Auto-run benchmarks on component load for demo purposes
    setTimeout(() => this.runBenchmarks(), 1000);
  }

  private updateReliabilityAssessment() {
    try {
      const assessment = BenchmarkService.assessReliability();
      this.reliabilityScore.set(assessment.reliabilityScore);
      this.reliabilityWarnings.set(assessment.warnings);
    } catch {
      this.reliabilityScore.set(50);
      this.reliabilityWarnings.set([
        'Unable to assess environment reliability',
      ]);
    }
  }

  getReliabilityClass(): string {
    const score = this.reliabilityScore();
    if (score >= 80) return 'reliability-good';
    if (score >= 60) return 'reliability-fair';
    return 'reliability-poor';
  }

  exportResults() {
    const results = this.results();
    const comparisonData = this.comparisonData();
    const environment = BenchmarkService.getBenchmarkEnvironment();

    if (!results) {
      alert('No results to export. Run benchmarks first.');
      return;
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      environment,
      reliabilityScore: this.reliabilityScore(),
      results,
      comparisonData,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-benchmark-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async runBenchmarks() {
    this.isRunning.set(true);
    this.error.set(null);

    try {
      // Check if required APIs are available
      if (!performance.now) {
        throw new Error('High-resolution timer not available');
      }

      const initialization = this.benchmarkService.benchmarkInitialization();

      const updates = this.benchmarkService.benchmarkUpdates();

      const computations = this.benchmarkService.benchmarkComputations();

      const lazyLoading = this.benchmarkService.benchmarkLazyLoading();

      const comparison = this.benchmarkService.compareWithNativeSignals();

      const results = {
        initialization,
        updates,
        computations,
        lazyLoading,
        comparison,
      };

      this.results.set(results);
      this.comparisonData.set(comparison);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Unknown error occurred'
      );
    } finally {
      this.isRunning.set(false);
    }
  }

  clearResults() {
    this.results.set(null);
    this.comparisonData.set(null);
    this.error.set(null);
  }

  clearError() {
    this.error.set(null);
  }

  getPerformanceGrade(): string {
    const results = this.results();
    if (!results) return 'N/A';

    const avgInitTime =
      (results.initialization.small.time +
        results.initialization.medium.time +
        results.initialization.large.time) /
      3;

    if (avgInitTime < 5) return 'A-plus';
    if (avgInitTime < 10) return 'A';
    if (avgInitTime < 20) return 'B';
    return 'C';
  }

  getMemoryEfficiency(): number {
    const results = this.results();
    if (!results) return 0;

    const savings =
      (results.lazyLoading.eager.memory - results.lazyLoading.lazy.memory) /
      results.lazyLoading.eager.memory;
    return Math.round(savings * 100);
  }

  getLazyLoadingBenefit(): number {
    const results = this.results();
    if (!results) return 0;

    return (
      Math.round(
        (results.lazyLoading.eager.memory / results.lazyLoading.lazy.memory) *
          10
      ) / 10
    );
  }

  getTimestamp(): string {
    return new Date().toLocaleString();
  }

  getInitializationData() {
    const results = this.results();
    if (!results) return [];

    const data = [
      { label: 'Small', value: results.initialization.small.time },
      { label: 'Medium', value: results.initialization.medium.time },
      { label: 'Large', value: results.initialization.large.time },
      { label: 'XLarge', value: results.initialization.xlarge.time },
    ];

    const maxTime = Math.max(...data.map((d) => d.value));
    return data.map((item) => ({
      ...item,
      percentage: (item.value / maxTime) * 100,
    }));
  }

  getPerformanceClass(time: number): string {
    if (time < 1) return 'excellent';
    if (time < 5) return 'good';
    if (time < 10) return 'average';
    return 'poor';
  }

  getLazyMemoryPercentage(): number {
    const results = this.results();
    if (!results) return 0;

    return (
      (results.lazyLoading.lazy.memory / results.lazyLoading.eager.memory) * 100
    );
  }

  getMemorySavings(): number {
    const results = this.results();
    if (!results) return 0;

    return Math.round(
      ((results.lazyLoading.eager.memory - results.lazyLoading.lazy.memory) /
        results.lazyLoading.eager.memory) *
        100
    );
  }

  formatMemory(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getAdvantageClass(ratio: number): string {
    if (ratio < 0.8) return 'better';
    if (ratio > 1.2) return 'worse';
    return 'similar';
  }

  getBrowserInfo(): string {
    return navigator.userAgent.split(' ').slice(-2).join(' ');
  }

  getCurrentMemory(): string {
    const memory = BenchmarkService.measureMemory();
    return memory ? this.formatMemory(memory) : 'Not available';
  }

  hasHighResTimer(): boolean {
    return 'now' in performance && performance.now() !== undefined;
  }
}
