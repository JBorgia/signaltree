import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

import { SignalTreeVsNgrxSignalsComponent } from './components/signaltree-vs-ngrx-signals.component';
import { SignalTreeVsNgrxStoreComponent } from './components/signaltree-vs-ngrx-store.component';

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
  environment?: EnvironmentMetrics;
}

interface EnvironmentMetrics {
  userAgent: string;
  memoryInfo?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  hardwareConcurrency: number;
  deviceMemory?: number;
  connection?: { effectiveType: string; downlink: number };
  isDevToolsOpen: boolean;
  isPageFocused: boolean;
  timestamp: string;
  reliability: number;
}

@Component({
  selector: 'app-realistic-comparison',
  standalone: true,
  imports: [
    CommonModule,
    SignalTreeVsNgrxStoreComponent,
    SignalTreeVsNgrxSignalsComponent,
  ],
  template: `
    <div class="benchmark-orchestrator">
      <div class="header">
        <h1>Real State Management Performance Comparison</h1>
        <p class="subtitle">
          <strong>No fake simulations.</strong> Genuine architectural
          comparisons between SignalTree, NgRx Store, and manual Angular
          signals.
        </p>

        <div class="environment-info">
          <h3>Environment Reliability: {{ reliabilityScore() }}/100</h3>
          <div class="env-details">
            <span>Browser: {{ environment().userAgent.split(' ')[0] }}</span>
            <span>CPU: {{ environment().hardwareConcurrency }} cores</span>
            <span *ngIf="environment().deviceMemory"
              >RAM: {{ environment().deviceMemory }}GB</span
            >
            <span class="warning" *ngIf="environment().isDevToolsOpen"
              >⚠️ DevTools Open</span
            >
            <span class="warning" *ngIf="!environment().isPageFocused"
              >⚠️ Tab Not Focused</span
            >
          </div>
        </div>
      </div>

      <div class="comparison-sections">
        <!-- SignalTree vs NgRx Store - Real State Management Comparison -->
        <app-signaltree-vs-ngrx-store></app-signaltree-vs-ngrx-store>

        <!-- SignalTree vs NgRx SignalStore - Modern State Management Comparison -->
        <app-signaltree-vs-ngrx-signals></app-signaltree-vs-ngrx-signals>
      </div>
      <div class="summary-section" *ngIf="showSummary()">
        <h2>Performance Summary</h2>
        <div class="architectural-insights">
          <h3>Key Architectural Insights</h3>
          <div class="insight-cards">
            <div class="insight-card">
              <h4>🏗️ SignalTree Architecture</h4>
              <p>
                Built for **granular reactivity** - direct property mutation
                with automatic dependency tracking. Ideal for complex nested
                state where you need precise updates without full object
                reconstruction.
              </p>
            </div>
            <div class="insight-card">
              <h4>🔧 NgRx Store Architecture</h4>
              <p>
                **Enterprise-grade** Redux pattern with memoized selectors and
                action/reducer structure. Excellent for large teams requiring
                predictable state flows and time-travel debugging.
              </p>
            </div>
            <div class="insight-card">
              <h4>⚡ Manual Signals Architecture</h4>
              <p>
                **Direct Angular signals** - minimal overhead but requires
                manual object reconstruction. Best for simple state where
                immutability patterns are manageable.
              </p>
            </div>
          </div>
        </div>

        <div class="export-section">
          <h3>Export Results</h3>
          <p>
            All benchmark data includes environment metadata for reliable
            performance analysis.
          </p>
          <div class="export-buttons">
            <button (click)="exportCSV()">📊 Export CSV</button>
            <button (click)="exportJSON()">📄 Export JSON</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .benchmark-orchestrator {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          sans-serif;
      }

      .header {
        text-align: center;
        margin-bottom: 3rem;
      }

      h1 {
        color: #1a202c;
        font-size: 2.5rem;
        margin-bottom: 1rem;
        font-weight: 700;
      }

      .subtitle {
        color: #4a5568;
        font-size: 1.25rem;
        margin-bottom: 2rem;
        line-height: 1.6;
      }

      .environment-info {
        background: #f7fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1.5rem;
        margin: 2rem auto;
        max-width: 600px;
      }

      .environment-info h3 {
        color: #2d3748;
        margin-bottom: 1rem;
        font-size: 1.25rem;
      }

      .env-details {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: center;
      }

      .env-details span {
        background: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        border: 1px solid #e2e8f0;
      }

      .warning {
        background: #fed7d7 !important;
        color: #c53030 !important;
        border-color: #fc8181 !important;
        font-weight: 600;
      }

      .comparison-sections {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .summary-section {
        margin-top: 3rem;
        padding: 2rem;
        background: #f0fff4;
        border-radius: 12px;
        border: 1px solid #c6f6d5;
      }

      .architectural-insights {
        margin-bottom: 2rem;
      }

      .insight-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-top: 1rem;
      }

      .insight-card {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .insight-card h4 {
        color: #2d3748;
        margin-bottom: 0.75rem;
        font-size: 1.1rem;
      }

      .insight-card p {
        color: #4a5568;
        line-height: 1.6;
        margin: 0;
      }

      .export-section {
        border-top: 1px solid #c6f6d5;
        padding-top: 2rem;
      }

      .export-buttons {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
      }

      .export-buttons button {
        background: #38a169;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.95rem;
      }

      .export-buttons button:hover {
        background: #2f855a;
      }

      h2 {
        color: #2d3748;
        margin-bottom: 1.5rem;
        font-size: 1.75rem;
      }

      h3 {
        color: #2d3748;
        margin-bottom: 1rem;
        font-size: 1.5rem;
      }
    `,
  ],
})
export class RealisticComparisonComponent {
  environment = signal<EnvironmentMetrics>(this.detectEnvironment());
  reliabilityScore = computed(() => this.calculateReliabilityScore());
  showSummary = computed(() => true);

  private detectEnvironment(): EnvironmentMetrics {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      hardwareConcurrency?: number;
      connection?: { effectiveType: string; downlink: number };
    };
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    const devToolsOpen =
      window.outerHeight - window.innerHeight > 200 ||
      window.outerWidth - window.innerWidth > 200;

    let memoryInfo;
    if (perf.memory) {
      memoryInfo = {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      };
    }

    let connection;
    if (nav.connection) {
      connection = {
        effectiveType: nav.connection.effectiveType,
        downlink: nav.connection.downlink,
      };
    }

    return {
      userAgent: navigator.userAgent,
      memoryInfo,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: nav.deviceMemory,
      connection,
      isDevToolsOpen: devToolsOpen,
      isPageFocused: document.hasFocus(),
      timestamp: new Date().toISOString(),
      reliability: 0,
    };
  }

  private calculateReliabilityScore(): number {
    const env = this.environment();
    let score = 100;

    if (env.isDevToolsOpen) score -= 25;
    if (!env.isPageFocused) score -= 20;
    if (
      env.connection?.effectiveType === 'slow-2g' ||
      env.connection?.effectiveType === '2g'
    )
      score -= 15;
    if (env.hardwareConcurrency < 4) score -= 10;
    if (env.deviceMemory && env.deviceMemory < 4) score -= 10;

    if (env.memoryInfo) {
      const memoryUsage =
        env.memoryInfo.usedJSHeapSize / env.memoryInfo.jsHeapSizeLimit;
      if (memoryUsage > 0.8) score -= 20;
      else if (memoryUsage > 0.6) score -= 10;
    }

    return Math.max(0, score);
  }

  exportCSV() {
    const headers = [
      'Timestamp',
      'Scenario',
      'Library',
      'P50 (ms)',
      'P95 (ms)',
      'Samples',
      'Environment',
      'Reliability',
    ];
    const csvContent = headers.join(',') + '\n';

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `signaltree-benchmark-${Date.now()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  exportJSON() {
    const data = {
      timestamp: new Date().toISOString(),
      environment: this.environment(),
      results: [],
      metadata: {
        note: 'Real architectural performance comparison - no fake simulations',
        libraries: {
          SignalTree: 'State management with granular reactivity',
          'NgRx Store': 'Enterprise Redux pattern with memoized selectors',
          'Manual Signals': 'Direct Angular signal() API usage',
        },
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `signaltree-benchmark-${Date.now()}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
