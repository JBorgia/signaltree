import { Injectable, signal } from '@angular/core';

export interface WebVitalsMetrics {
  lcp?: number; // ms
  inp?: number; // ms
  cls?: number; // unitless
  ttfb?: number; // ms
  longTasks: {
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
  };
}

@Injectable({ providedIn: 'root' })
export class WebVitalsService {
  readonly available = signal<boolean>(false);
  readonly metrics = signal<WebVitalsMetrics>({
    longTasks: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
  });

  private longTaskObserver?: PerformanceObserver;
  private started = false;

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      // Dynamically import to avoid hard dependency if not installed
      const webVitals = await import('web-vitals');
      type Metric = import('web-vitals').Metric;
      this.available.set(true);

      webVitals.onLCP((metric: Metric) => {
        this.metrics.update((m) => ({ ...m, lcp: metric.value }));
      });
      webVitals.onINP((metric: Metric) => {
        this.metrics.update((m) => ({ ...m, inp: metric.value }));
      });
      webVitals.onCLS((metric: Metric) => {
        this.metrics.update((m) => ({ ...m, cls: metric.value }));
      });
      webVitals.onTTFB((metric: Metric) => {
        this.metrics.update((m) => ({ ...m, ttfb: metric.value }));
      });
    } catch {
      // web-vitals not installed; still observe long tasks
      this.available.set(false);
    }

    // Long tasks via PerformanceObserver
    if ('PerformanceObserver' in window) {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          let count = 0;
          let total = 0;
          let max = 0;
          for (const entry of list.getEntries() as PerformanceEntry[]) {
            const d = entry.duration;
            count++;
            total += d;
            if (d > max) max = d;
          }
          this.metrics.update((m) => ({
            ...m,
            longTasks: {
              count: m.longTasks.count + count,
              totalDurationMs: m.longTasks.totalDurationMs + total,
              maxDurationMs: Math.max(m.longTasks.maxDurationMs, max),
            },
          }));
        });
        this.longTaskObserver.observe({
          type: 'longtask',
          buffered: true,
        } as PerformanceObserverInit);
      } catch {
        // ignore if not supported
      }
    }
  }

  // Map Core Web Vitals to a bounded penalty using Google's thresholds
  // https://web.dev/articles/vitals
  computeVitalsPenalty(): {
    penalty: number;
    details: Array<{ factor: string; impact: number; reason: string }>;
  } {
    const m = this.metrics();
    const details: Array<{ factor: string; impact: number; reason: string }> =
      [];
    let penalty = 0;

    // INP: good ≤ 200ms, needs-improvement 200–500ms, poor > 500ms
    if (typeof m.inp === 'number') {
      let p = 0;
      if (m.inp <= 200) p = 0;
      else if (m.inp <= 500) p = 5;
      else p = 10;
      penalty += p;
      details.push({
        factor: 'INP',
        impact: -p,
        reason: `${Math.round(m.inp)}ms interaction latency`,
      });
    }

    // LCP: good ≤ 2500ms, NI 2500–4000ms, poor > 4000ms
    if (typeof m.lcp === 'number') {
      let p = 0;
      if (m.lcp <= 2500) p = 0;
      else if (m.lcp <= 4000) p = 3;
      else p = 6;
      penalty += p;
      details.push({
        factor: 'LCP',
        impact: -p,
        reason: `${Math.round(m.lcp)}ms largest contentful paint`,
      });
    }

    // CLS: good ≤ 0.1, NI 0.1–0.25, poor > 0.25
    if (typeof m.cls === 'number') {
      let p = 0;
      if (m.cls <= 0.1) p = 0;
      else if (m.cls <= 0.25) p = 5;
      else p = 10;
      penalty += p;
      details.push({
        factor: 'CLS',
        impact: -p,
        reason: `${m.cls.toFixed(3)} layout shift`,
      });
    }

    // TTFB: good ≤ 800ms, NI 800–1800ms, poor > 1800ms
    if (typeof m.ttfb === 'number') {
      let p = 0;
      if (m.ttfb <= 800) p = 0;
      else if (m.ttfb <= 1800) p = 3;
      else p = 6;
      penalty += p;
      details.push({
        factor: 'TTFB',
        impact: -p,
        reason: `${Math.round(m.ttfb)}ms server response`,
      });
    }

    // Long tasks aggregate penalty (small)
    const lt = m.longTasks;
    if (lt.count > 0) {
      // Up to 5 points if total long task time is high
      const total = lt.totalDurationMs;
      const p = Math.max(0, Math.min(5, Math.round(total / 200))); // ~1pt per 200ms
      penalty += p;
      details.push({
        factor: 'Long Tasks',
        impact: -p,
        reason: `${lt.count} tasks, ${Math.round(total)}ms total`,
      });
    }

    return { penalty, details };
  }
}
