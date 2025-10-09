import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';

import { PerformanceMonitorService } from '../../services/performance-monitor.service';

@Component({
  selector: 'app-performance-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance-dashboard.component.html',
  styleUrls: ['./performance-dashboard.component.scss'],
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
