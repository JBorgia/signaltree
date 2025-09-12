import { Injectable, signal } from '@angular/core';

/**
 * Enhanced Performance Monitoring Service
 * Collects, aggregates, and reports comprehensive performance metrics
 */
@Injectable({
  providedIn: 'root',
})
export class PerformanceMonitorService {
  private metrics = signal<PerformanceMetrics>({
    signalTree: {
      operations: [],
      averageOperationTime: 0,
      totalOperations: 0,
      memoryUsage: 0,
    },
    pageLoad: {
      totalTime: 0,
      domContentLoaded: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
    },
    bundleSize: {
      main: 0,
      polyfills: 0,
      styles: 0,
      lazy: {},
    },
    userInteractions: {
      clickResponsiveness: [],
      navigationTime: [],
    },
    systemInfo: {
      userAgent: '',
      memory: 0,
      cores: 0,
      connection: '',
    },
  });

  constructor() {
    this.initializeSystemInfo();
    this.monitorPagePerformance();
  }

  /**
   * Record a SignalTree operation performance
   */
  recordSignalTreeOperation(
    operation: string,
    duration: number,
    metadata?: Record<string, unknown>
  ) {
    const current = this.metrics();
    const newOperation: OperationMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    current.signalTree.operations.push(newOperation);
    current.signalTree.totalOperations++;

    // Calculate rolling average (last 100 operations)
    const recentOps = current.signalTree.operations.slice(-100);
    current.signalTree.averageOperationTime =
      recentOps.reduce((sum, op) => sum + op.duration, 0) / recentOps.length;

    this.metrics.set({ ...current });
  }

  /**
   * Record user interaction responsiveness
   */
  recordUserInteraction(type: 'click' | 'navigation', duration: number) {
    const current = this.metrics();

    if (type === 'click') {
      current.userInteractions.clickResponsiveness.push({
        duration,
        timestamp: Date.now(),
      });
      // Keep only last 50 interactions
      if (current.userInteractions.clickResponsiveness.length > 50) {
        current.userInteractions.clickResponsiveness.shift();
      }
    } else {
      current.userInteractions.navigationTime.push({
        duration,
        timestamp: Date.now(),
      });
      // Keep only last 20 navigations
      if (current.userInteractions.navigationTime.length > 20) {
        current.userInteractions.navigationTime.shift();
      }
    }

    this.metrics.set({ ...current });
  }

  /**
   * Update memory usage information
   */
  updateMemoryUsage() {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (
        performance as unknown as { memory: { usedJSHeapSize: number } }
      ).memory;
      const current = this.metrics();
      current.signalTree.memoryUsage = memory.usedJSHeapSize;
      this.metrics.set({ ...current });
    }
  }

  /**
   * Get current performance snapshot
   */
  getMetrics() {
    return this.metrics();
  }

  /**
   * Get performance score (0-100)
   */
  getPerformanceScore(): PerformanceScore {
    const metrics = this.metrics();

    // SignalTree operation score (0-50ms = 100, 50-200ms = linear decline, >200ms = 0)
    const avgOpTime = metrics.signalTree.averageOperationTime;
    const operationScore = Math.min(
      100,
      Math.max(0, avgOpTime <= 50 ? 100 : 100 - ((avgOpTime - 50) / 150) * 100)
    );

    // Click responsiveness score (0-100ms = 100, 100-500ms = linear decline, >500ms = 0)
    const clickTimes = metrics.userInteractions.clickResponsiveness.map(
      (c) => c.duration
    );
    const avgClickTime =
      clickTimes.length > 0
        ? clickTimes.reduce((sum, time) => sum + time, 0) / clickTimes.length
        : 100; // Default to good score if no data
    const clickScore = Math.min(
      100,
      Math.max(
        0,
        avgClickTime <= 100 ? 100 : 100 - ((avgClickTime - 100) / 400) * 100
      )
    );

    // Page load score (0-1s = 100, 1-10s = linear decline, >10s = 0)
    const loadTime = metrics.pageLoad.totalTime;
    const loadScore = Math.min(
      100,
      Math.max(
        0,
        loadTime <= 1000 ? 100 : 100 - ((loadTime - 1000) / 9000) * 100
      )
    );

    // Memory efficiency score (0-50MB = 100, 50-200MB = linear decline, >200MB = 0)
    const memoryMB = metrics.signalTree.memoryUsage / (1024 * 1024);
    const memoryScore = Math.min(
      100,
      Math.max(0, memoryMB <= 50 ? 100 : 100 - ((memoryMB - 50) / 150) * 100)
    );

    const overall = (operationScore + clickScore + loadScore + memoryScore) / 4;

    return {
      overall: Math.round(overall),
      operation: Math.round(operationScore),
      responsiveness: Math.round(clickScore),
      loading: Math.round(loadScore),
      memory: Math.round(memoryScore),
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const metrics = this.metrics();
    const score = this.getPerformanceScore();

    return {
      timestamp: new Date().toISOString(),
      score,
      metrics,
      recommendations: this.getRecommendations(score, metrics),
      summary: {
        totalOperations: metrics.signalTree.totalOperations,
        averageResponseTime: metrics.signalTree.averageOperationTime,
        memoryUsageMB: Math.round(
          metrics.signalTree.memoryUsage / (1024 * 1024)
        ),
        pageLoadTime: metrics.pageLoad.totalTime,
      },
    };
  }

  /**
   * Export performance data for analysis
   */
  exportData(): string {
    return JSON.stringify(this.generateReport(), null, 2);
  }

  private initializeSystemInfo() {
    const current = this.metrics();

    if (typeof window !== 'undefined') {
      current.systemInfo.userAgent = navigator.userAgent;
      current.systemInfo.cores = navigator.hardwareConcurrency || 0;

      if ('memory' in performance) {
        current.systemInfo.memory = (
          performance as unknown as { memory: { jsHeapSizeLimit: number } }
        ).memory.jsHeapSizeLimit;
      }

      if ('connection' in navigator) {
        current.systemInfo.connection =
          (navigator as unknown as { connection?: { effectiveType?: string } })
            .connection?.effectiveType || 'unknown';
      }
    }

    this.metrics.set({ ...current });
  }

  private monitorPagePerformance() {
    if (typeof window !== 'undefined') {
      // Page load timing
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType(
            'navigation'
          )[0] as PerformanceNavigationTiming;
          const current = this.metrics();

          current.pageLoad.totalTime =
            navigation.loadEventEnd - navigation.fetchStart;
          current.pageLoad.domContentLoaded =
            navigation.domContentLoadedEventEnd - navigation.fetchStart;

          this.metrics.set({ ...current });
        }, 0);
      });

      // Paint timing
      if ('getEntriesByType' in performance) {
        const observer = new PerformanceObserver((list) => {
          const current = this.metrics();

          list.getEntries().forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              current.pageLoad.firstContentfulPaint = entry.startTime;
            } else if (entry.name === 'largest-contentful-paint') {
              current.pageLoad.largestContentfulPaint = entry.startTime;
            }
          });

          this.metrics.set({ ...current });
        });

        observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
      }
    }
  }

  private getRecommendations(
    score: PerformanceScore,
    metrics: PerformanceMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (score.operation < 80) {
      recommendations.push(
        'Consider optimizing SignalTree operations or reducing operation frequency'
      );
    }

    if (score.responsiveness < 80) {
      recommendations.push(
        'User interactions are slow. Check for blocking operations in event handlers'
      );
    }

    if (score.loading < 80) {
      recommendations.push(
        'Page load time is high. Consider code splitting or bundle optimization'
      );
    }

    if (score.memory < 80) {
      recommendations.push(
        'High memory usage detected. Check for memory leaks or optimize data structures'
      );
    }

    if (metrics.signalTree.operations.length > 1000) {
      recommendations.push(
        'High operation count. Consider implementing operation batching'
      );
    }

    return recommendations;
  }
}

// Types
interface OperationMetric {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface InteractionMetric {
  duration: number;
  timestamp: number;
}

interface PerformanceMetrics {
  signalTree: {
    operations: OperationMetric[];
    averageOperationTime: number;
    totalOperations: number;
    memoryUsage: number;
  };
  pageLoad: {
    totalTime: number;
    domContentLoaded: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
  };
  bundleSize: {
    main: number;
    polyfills: number;
    styles: number;
    lazy: Record<string, number>;
  };
  userInteractions: {
    clickResponsiveness: InteractionMetric[];
    navigationTime: InteractionMetric[];
  };
  systemInfo: {
    userAgent: string;
    memory: number;
    cores: number;
    connection: string;
  };
}

interface PerformanceScore {
  overall: number;
  operation: number;
  responsiveness: number;
  loading: number;
  memory: number;
}

interface PerformanceReport {
  timestamp: string;
  score: PerformanceScore;
  metrics: PerformanceMetrics;
  recommendations: string[];
  summary: {
    totalOperations: number;
    averageResponseTime: number;
    memoryUsageMB: number;
    pageLoadTime: number;
  };
}
