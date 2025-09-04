import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';

import { PerformanceMonitorService } from '../../services/performance-monitor.service';

@Component({
  selector: 'app-performance-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="performance-dashboard p-6 bg-gray-50 rounded-lg">
      <h2 class="text-2xl font-bold mb-6 text-gray-800">
        🚀 Performance Dashboard
      </h2>

      <!-- Performance Score Overview -->
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div class="score-card bg-white p-4 rounded-lg shadow-sm">
          <div class="text-sm text-gray-600">Overall Score</div>
          <div
            class="text-2xl font-bold"
            [class]="getScoreClass(score().overall)"
          >
            {{ score().overall }}/100
          </div>
        </div>

        <div class="score-card bg-white p-4 rounded-lg shadow-sm">
          <div class="text-sm text-gray-600">Operations</div>
          <div
            class="text-2xl font-bold"
            [class]="getScoreClass(score().operation)"
          >
            {{ score().operation }}/100
          </div>
        </div>

        <div class="score-card bg-white p-4 rounded-lg shadow-sm">
          <div class="text-sm text-gray-600">Responsiveness</div>
          <div
            class="text-2xl font-bold"
            [class]="getScoreClass(score().responsiveness)"
          >
            {{ score().responsiveness }}/100
          </div>
        </div>

        <div class="score-card bg-white p-4 rounded-lg shadow-sm">
          <div class="text-sm text-gray-600">Loading</div>
          <div
            class="text-2xl font-bold"
            [class]="getScoreClass(score().loading)"
          >
            {{ score().loading }}/100
          </div>
        </div>

        <div class="score-card bg-white p-4 rounded-lg shadow-sm">
          <div class="text-sm text-gray-600">Memory</div>
          <div
            class="text-2xl font-bold"
            [class]="getScoreClass(score().memory)"
          >
            {{ score().memory }}/100
          </div>
        </div>
      </div>

      <!-- Real-time Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="metrics-card bg-white p-4 rounded-lg shadow-sm">
          <h3 class="text-lg font-semibold mb-3 text-gray-800">
            SignalTree Performance
          </h3>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-600">Total Operations:</span>
              <span class="font-medium">{{ summary().totalOperations }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Avg Response Time:</span>
              <span class="font-medium"
                >{{ summary().averageResponseTime.toFixed(3) }}ms</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Memory Usage:</span>
              <span class="font-medium">{{ summary().memoryUsageMB }}MB</span>
            </div>
          </div>
        </div>

        <div class="metrics-card bg-white p-4 rounded-lg shadow-sm">
          <h3 class="text-lg font-semibold mb-3 text-gray-800">
            Page Performance
          </h3>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-600">Page Load Time:</span>
              <span class="font-medium"
                >{{ summary().pageLoadTime.toFixed(0) }}ms</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">DOM Ready:</span>
              <span class="font-medium"
                >{{ metrics().pageLoad.domContentLoaded.toFixed(0) }}ms</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">First Paint:</span>
              <span class="font-medium"
                >{{
                  metrics().pageLoad.firstContentfulPaint.toFixed(0)
                }}ms</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Operations -->
      <div class="operations-log bg-white p-4 rounded-lg shadow-sm mb-6">
        <h3 class="text-lg font-semibold mb-3 text-gray-800">
          Recent Operations
        </h3>
        <div class="max-h-48 overflow-y-auto">
          <div class="space-y-1">
            <div
              *ngFor="let op of recentOperations(); trackBy: trackOperation"
              class="flex justify-between items-center py-1 px-2 bg-gray-50 rounded text-sm"
            >
              <span class="font-medium">{{ op.operation }}</span>
              <span class="text-gray-600">{{ op.duration.toFixed(3) }}ms</span>
            </div>
            <div
              *ngIf="recentOperations().length === 0"
              class="text-gray-500 text-center py-4"
            >
              No operations recorded yet
            </div>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div
        class="recommendations bg-white p-4 rounded-lg shadow-sm"
        *ngIf="recommendations().length > 0"
      >
        <h3 class="text-lg font-semibold mb-3 text-gray-800">
          🎯 Recommendations
        </h3>
        <ul class="space-y-2">
          <li
            *ngFor="let rec of recommendations()"
            class="flex items-start gap-2 text-sm"
          >
            <span class="text-blue-500 mt-1">•</span>
            <span>{{ rec }}</span>
          </li>
        </ul>
      </div>

      <!-- Export Controls -->
      <div class="export-controls bg-white p-4 rounded-lg shadow-sm mt-6">
        <h3 class="text-lg font-semibold mb-3 text-gray-800">
          Export & Analysis
        </h3>
        <div class="flex gap-3">
          <button
            (click)="exportData()"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Export Performance Data
          </button>
          <button
            (click)="clearData()"
            class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Clear Metrics
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .score-card {
        border-left: 4px solid #e5e7eb;
      }

      .score-excellent {
        color: #16a34a;
        border-left-color: #16a34a;
      }

      .score-good {
        color: #ca8a04;
        border-left-color: #ca8a04;
      }

      .score-poor {
        color: #dc2626;
        border-left-color: #dc2626;
      }

      .performance-dashboard {
        animation: fadeIn 0.3s ease-in;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
})
export class PerformanceDashboardComponent implements OnInit, OnDestroy {
  private updateInterval?: number;
  private performanceMonitor = inject(PerformanceMonitorService);

  score = computed(() => this.performanceMonitor.getPerformanceScore());
  metrics = computed(() => this.performanceMonitor.getMetrics());
  summary = computed(() => this.performanceMonitor.generateReport().summary);
  recommendations = computed(
    () => this.performanceMonitor.generateReport().recommendations
  );

  recentOperations = computed(() => {
    const ops = this.metrics().signalTree.operations;
    return ops.slice(-10).reverse(); // Last 10 operations, newest first
  });

  ngOnInit() {
    // Update metrics every 2 seconds
    this.updateInterval = window.setInterval(() => {
      this.performanceMonitor.updateMemoryUsage();
    }, 2000);

    // Record initial page interaction
    this.performanceMonitor.recordUserInteraction(
      'navigation',
      performance.now()
    );
  }

  ngOnDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    return 'score-poor';
  }

  trackOperation(
    index: number,
    operation: { timestamp: number; operation: string; duration: number }
  ): string {
    return operation.timestamp.toString();
  }

  exportData() {
    const data = this.performanceMonitor.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-performance-${new Date()
      .toISOString()
      .slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearData() {
    // This would require adding a method to the service
    location.reload();
  }
}
