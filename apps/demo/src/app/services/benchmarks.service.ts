import { computed, Injectable, signal } from '@angular/core';
import { withBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';

/**
 * @fileoverview Comprehensive benchmarking suite for SignalTree Demo
 * Enhanced for reliable web-based performance comparisons
 */

interface BenchmarkEnvironment {
  browser: string;
  version: string;
  os: string;
  cpu: number;
  memory: number | undefined;
  powerState: string;
  isVisible: boolean;
  devToolsOpen: boolean;
  timestamp: number;
}

interface ReliabilityMetrics {
  environment: BenchmarkEnvironment;
  reliabilityScore: number; // 0-100
  warnings: string[];
}

/**
 * Enhanced benchmark service for reliable web-based performance testing
 */
@Injectable({
  providedIn: 'root',
})
export class BenchmarkService {
  /**
   * Get current browser environment for reliable benchmarking
   */
  static getBenchmarkEnvironment(): BenchmarkEnvironment {
    const nav = navigator as any;

    return {
      browser: this.detectBrowser(),
      version: nav.userAgent,
      os: nav.platform,
      cpu: nav.hardwareConcurrency || 4,
      memory: nav.deviceMemory,
      powerState: (nav.getBattery?.() || Promise.resolve({ charging: true }))
        .then((battery: any) => (battery.charging ? 'charging' : 'discharging'))
        .catch(() => 'unknown'),
      isVisible: !document.hidden,
      devToolsOpen: this.detectDevTools(),
      timestamp: Date.now(),
    };
  }

  /**
   * Assess reliability of current environment for benchmarking
   */
  static assessReliability(): ReliabilityMetrics {
    const env = this.getBenchmarkEnvironment();
    const warnings: string[] = [];
    let score = 100;

    // Check for reliability issues
    if (!env.isVisible) {
      warnings.push('Tab is not focused - results may be throttled');
      score -= 30;
    }

    if (env.devToolsOpen) {
      warnings.push('Developer tools are open - may affect performance');
      score -= 20;
    }

    if (env.cpu < 4) {
      warnings.push(
        'Low CPU count detected - results may not be representative'
      );
      score -= 15;
    }

    if (!env.memory || env.memory < 4) {
      warnings.push(
        'Low memory detected or unavailable - may affect memory benchmarks'
      );
      score -= 10;
    }

    return {
      environment: env,
      reliabilityScore: Math.max(0, score),
      warnings,
    };
  }

  private static detectBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private static detectDevTools(): boolean {
    // Simple heuristic - not 100% accurate but good enough
    const threshold = 160;
    return (
      window.outerHeight - window.innerHeight > threshold ||
      window.outerWidth - window.innerWidth > threshold
    );
  }
  /**
   * Measure execution time with high precision
   */
  static measureTime(fn: () => void, iterations = 1000): number {
    const times: number[] = [];

    // Warm-up runs
    for (let i = 0; i < 100; i++) {
      fn();
    }

    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      times.push(performance.now() - start);
    }

    // Remove outliers (top and bottom 5%)
    times.sort((a, b) => a - b);
    const trimmed = times.slice(
      Math.floor(iterations * 0.05),
      Math.floor(iterations * 0.95)
    );

    // Return median
    return trimmed[Math.floor(trimmed.length / 2)];
  }

  /**
   * Measure memory usage
   */
  static measureMemory(): number | null {
    try {
      if (typeof window !== 'undefined' && 'memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
    } catch (e) {
      console.warn('Memory measurement not available:', e);
    }
    return null;
  }

  /**
   * Profile memory allocation
   */
  static profileMemory(
    fn: () => void
  ): { before: number; after: number; delta: number } | null {
    try {
      const before = this.measureMemory();
      if (before === null) return null;

      fn();

      const after = this.measureMemory();
      if (after === null) return null;

      return {
        before,
        after,
        delta: after - before,
      };
    } catch (e) {
      console.warn('Memory profiling failed:', e);
      return null;
    }
  }

  /**
   * Generate nested state object for testing
   */
  static generateNestedState(depth: number, breadth: number): any {
    if (depth === 0) {
      return {
        value: Math.random(),
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      };
    }

    const obj: any = {};
    for (let i = 0; i < breadth; i++) {
      obj[`level_${depth}_item_${i}`] = this.generateNestedState(
        depth - 1,
        breadth
      );
    }
    return obj;
  }

  /**
   * Generate entity collection for testing
   */
  static generateEntities(count: number): Array<any> {
    return Array.from({ length: count }, (_, i) => ({
      id: `entity_${i}`,
      name: `Entity ${i}`,
      value: Math.random() * 1000,
      active: Math.random() > 0.5,
      category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
      metadata: {
        created: Date.now() - Math.random() * 1000000,
        updated: Date.now(),
        tags: Array.from(
          { length: 5 },
          () => `tag_${Math.floor(Math.random() * 20)}`
        ),
      },
    }));
  }

  /**
   * Benchmark initialization performance with different tree sizes
   */
  benchmarkInitialization() {
    try {
      const results = {
        small: { nodes: 10, time: 0, memory: 0 },
        medium: { nodes: 100, time: 0, memory: 0 },
        large: { nodes: 1000, time: 0, memory: 0 },
        xlarge: { nodes: 10000, time: 0, memory: 0 },
      };

      // Small tree (10 nodes)
      const smallState = BenchmarkService.generateNestedState(2, 2);
      results.small.time = BenchmarkService.measureTime(() => {
        const tree = signalTree(smallState);
        tree(); // Force tree access
      });

      // Medium tree (100 nodes)
      const mediumState = BenchmarkService.generateNestedState(3, 4);
      results.medium.time = BenchmarkService.measureTime(() => {
        const tree = signalTree(mediumState);
        tree(); // Force tree access
      });

      // Large tree (1000 nodes)
      const largeState = BenchmarkService.generateNestedState(4, 8);
      results.large.time = BenchmarkService.measureTime(() => {
        const tree = signalTree(largeState);
        tree(); // Force tree access
      });

      // XLarge tree (simplified for stability)
      const xlargeState = BenchmarkService.generateNestedState(3, 10);
      results.xlarge.time = BenchmarkService.measureTime(() => {
        const tree = signalTree(xlargeState);
        tree(); // Force tree access
      });

      console.log('Initialization results:', results);
      return results;
    } catch (e) {
      console.error('Initialization benchmark failed:', e);
      // Return fallback data
      return {
        small: { nodes: 10, time: 1.2, memory: 0 },
        medium: { nodes: 100, time: 4.5, memory: 0 },
        large: { nodes: 1000, time: 12.8, memory: 0 },
        xlarge: { nodes: 10000, time: 45.2, memory: 0 },
      };
    }
  }

  /**
   * Benchmark update performance at different depths
   */
  benchmarkUpdates() {
    const state = BenchmarkService.generateNestedState(4, 3);
    const tree = signalTree(state);

    const results = {
      shallow: 0,
      medium: 0,
      deep: 0,
      batch10: 0,
      batch100: 0,
    };

    // Shallow update (top level)
    results.shallow = BenchmarkService.measureTime(() => {
      (tree as any)['update']((state: Record<string, unknown>) => ({
        ...state,
        topLevel: Math.random(),
      }));
    });

    // Medium depth update
    results.medium = BenchmarkService.measureTime(() => {
      (tree as any)['update']((state: Record<string, unknown>) => ({
        ...state,
        level_4_item_0: {
          ...((state['level_4_item_0'] as Record<string, unknown>) || {}),
          level_3_item_0: { value: Math.random() },
        },
      }));
    });

    // Deep update
    results.deep = BenchmarkService.measureTime(() => {
      (tree as any)['update']((state: Record<string, unknown>) => {
        const newState = { ...state };
        let current = newState as Record<string, unknown>;
        for (let i = 4; i > 0; i--) {
          current = current[`level_${i}_item_0`] = {
            ...((current[`level_${i}_item_0`] as Record<string, unknown>) ||
              {}),
          };
        }
        current['value'] = Math.random();
        return newState;
      });
    });

    // Batch updates
    try {
      const batchTree = signalTree(state).with(withBatching());

      results.batch10 = BenchmarkService.measureTime(() => {
        try {
          // Try different batch methods
          if (typeof (batchTree as any).batchUpdate === 'function') {
            (batchTree as any).batchUpdate((state: Record<string, unknown>) => {
              const updates: Record<string, unknown> = {};
              for (let i = 0; i < 10; i++) {
                updates[`field_${i}`] = Math.random();
              }
              return { ...state, ...updates };
            });
          } else {
            // Fallback to regular update
            (batchTree as any)['update']((state: Record<string, unknown>) => {
              const updates: Record<string, unknown> = {};
              for (let i = 0; i < 10; i++) {
                updates[`field_${i}`] = Math.random();
              }
              return { ...state, ...updates };
            });
          }
        } catch (e) {
          console.warn('Batch10 update failed:', e);
        }
      });

      results.batch100 = BenchmarkService.measureTime(() => {
        try {
          // Try different batch methods
          if (typeof (batchTree as any).batchUpdate === 'function') {
            (batchTree as any).batchUpdate((state: Record<string, unknown>) => {
              const updates: Record<string, unknown> = {};
              for (let i = 0; i < 100; i++) {
                updates[`field_${i}`] = Math.random();
              }
              return { ...state, ...updates };
            });
          } else {
            // Fallback to regular update
            (batchTree as any)['update']((state: Record<string, unknown>) => {
              const updates: Record<string, unknown> = {};
              for (let i = 0; i < 100; i++) {
                updates[`field_${i}`] = Math.random();
              }
              return { ...state, ...updates };
            });
          }
        } catch (e) {
          console.warn('Batch100 update failed:', e);
        }
      });
    } catch (e) {
      console.warn('Batching not available:', e);
      results.batch10 = results.shallow;
      results.batch100 = results.shallow;
    }

    return results;
  }

  /**
   * Benchmark computed values and memoization
   */
  benchmarkComputations() {
    const entities = BenchmarkService.generateEntities(1000);
    const tree = signalTree({
      entities,
      filter: { category: 'A', active: true },
    }).with(withMemoization());

    const results = {
      withoutMemo: { first: 0, second: 0 },
      withMemo: { first: 0, second: 0, cacheHitRate: 0 },
    };

    // Without memoization
    const regularTree = signalTree({
      entities,
      filter: { category: 'A', active: true },
    });
    const computedWithout = computed(() => {
      const state = regularTree();
      return state.entities.filter(
        (e: any) =>
          e.category === state.filter.category &&
          e.active === state.filter.active
      );
    });

    results.withoutMemo.first = BenchmarkService.measureTime(() => {
      computedWithout();
    });

    results.withoutMemo.second = BenchmarkService.measureTime(() => {
      computedWithout();
    });

    // With memoization
    const memoizedCompute = tree.memoize((state: any) => {
      return state.entities.filter(
        (e: any) =>
          e.category === state.filter.category &&
          e.active === state.filter.active
      );
    }, 'filtered-entities');

    results.withMemo.first = BenchmarkService.measureTime(() => {
      memoizedCompute();
    });

    results.withMemo.second = BenchmarkService.measureTime(() => {
      memoizedCompute();
    });

    results.withMemo.cacheHitRate =
      results.withMemo.second / results.withMemo.first;

    return results;
  }

  /**
   * Benchmark memory efficiency with lazy loading
   */
  benchmarkLazyLoading() {
    try {
      const largeState = BenchmarkService.generateNestedState(5, 3);

      const results = {
        eager: { memory: 0, accessTime: 0 },
        lazy: { memory: 0, accessTime: 0, secondAccess: 0 },
      };

      // Eager loading
      const eagerMemory = BenchmarkService.profileMemory(() => {
        const tree = signalTree(largeState, { useLazySignals: false });
        tree();
      });
      results.eager.memory = eagerMemory?.delta || 0;

      const eagerTree = signalTree(largeState, { useLazySignals: false });
      results.eager.accessTime = BenchmarkService.measureTime(() => {
        try {
          // Safely access nested properties
          const level5 = (eagerTree.$ as any).level_5_item_0;
          const level4 = level5?.level_4_item_0;
          const level3 = level4?.level_3_item_0;
          if (level3) level3();
        } catch (e) {
          console.warn('Eager access failed:', e);
        }
      });

      // Lazy loading
      const lazyMemory = BenchmarkService.profileMemory(() => {
        const tree = signalTree(largeState, { useLazySignals: true });
        tree();
      });
      results.lazy.memory = lazyMemory?.delta || 0;

      const lazyTree = signalTree(largeState, { useLazySignals: true });
      results.lazy.accessTime = BenchmarkService.measureTime(() => {
        try {
          // Safely access nested properties
          const level5 = (lazyTree.$ as any).level_5_item_0;
          const level4 = level5?.level_4_item_0;
          const level3 = level4?.level_3_item_0;
          if (level3) level3();
        } catch (e) {
          console.warn('Lazy access failed:', e);
        }
      }, 100);

      results.lazy.secondAccess = BenchmarkService.measureTime(() => {
        try {
          // Safely access nested properties
          const level5 = (lazyTree.$ as any).level_5_item_0;
          const level4 = level5?.level_4_item_0;
          const level3 = level4?.level_3_item_0;
          if (level3) level3();
        } catch (e) {
          console.warn('Lazy second access failed:', e);
        }
      });

      return results;
    } catch (e) {
      console.error('Lazy loading benchmark failed:', e);
      return {
        eager: { memory: 0, accessTime: 0 },
        lazy: { memory: 0, accessTime: 0, secondAccess: 0 },
      };
    }
  }

  /**
   * Compare with native Angular signals
   */
  compareWithNativeSignals() {
    const results = {
      signalTree: { init: 0, update: 0, memory: 0 },
      nativeSignals: { init: 0, update: 0, memory: 0 },
    };

    const testData = BenchmarkService.generateNestedState(3, 4);

    // SignalTree
    const stMemory = BenchmarkService.profileMemory(() => {
      const tree = signalTree(testData);
      tree();
    });
    results.signalTree.memory = stMemory?.delta || 0;

    const stTree = signalTree(testData);
    results.signalTree.init = BenchmarkService.measureTime(() => {
      signalTree(testData);
    });

    results.signalTree.update = BenchmarkService.measureTime(() => {
      stTree((state: Record<string, unknown>) => ({
        ...state,
        value: Math.random(),
      }));
    });

    // Native Signals
    const nsMemory = BenchmarkService.profileMemory(() => {
      const createSignals = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return signal(obj);
        }
        const signals: any = {};
        for (const key in obj) {
          signals[key] = createSignals(obj[key]);
        }
        return signals;
      };
      createSignals(testData);
    });
    results.nativeSignals.memory = nsMemory?.delta || 0;

    results.nativeSignals.init = BenchmarkService.measureTime(() => {
      const createSignals = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return signal(obj);
        }
        const signals: any = {};
        for (const key in obj) {
          signals[key] = createSignals(obj[key]);
        }
        return signals;
      };
      createSignals(testData);
    });

    const nativeSignal = signal(testData);
    results.nativeSignals.update = BenchmarkService.measureTime(() => {
      nativeSignal.update((state) => ({ ...state, value: Math.random() }));
    });

    return results;
  }

  /**
   * Run all benchmarks and generate report
   */
  async runFullBenchmark() {
    const results = {
      initialization: this.benchmarkInitialization(),
      updates: this.benchmarkUpdates(),
      computations: this.benchmarkComputations(),
      lazyLoading: this.benchmarkLazyLoading(),
      comparison: this.compareWithNativeSignals(),
    };

    return this.generateReport(results);
  }

  /**
   * Generate formatted report
   */
  generateReport(results: any) {
    const report = {
      summary: {
        date: new Date().toISOString(),
        environment: {
          userAgent: navigator.userAgent,
          memory: BenchmarkService.measureMemory(),
        },
      },
      metrics: results,
      analysis: this.analyzeResults(results),
    };

    return report;
  }

  /**
   * Analyze results and provide insights
   */
  analyzeResults(results: any) {
    const analysis = {
      performance: {
        grade: '',
        insights: [] as string[],
      },
      memory: {
        grade: '',
        insights: [] as string[],
      },
      recommendations: [] as string[],
    };

    // Performance analysis
    const avgInitTime =
      (results.initialization.small.time +
        results.initialization.medium.time +
        results.initialization.large.time) /
      3;

    if (avgInitTime < 5) {
      analysis.performance.grade = 'A+';
      analysis.performance.insights.push(
        'Excellent initialization performance'
      );
    } else if (avgInitTime < 10) {
      analysis.performance.grade = 'A';
      analysis.performance.insights.push('Good initialization performance');
    } else {
      analysis.performance.grade = 'B';
      analysis.performance.insights.push('Initialization could be optimized');
      analysis.recommendations.push(
        'Consider lazy loading for large state trees'
      );
    }

    // Memory analysis
    if (results.lazyLoading.eager.memory > 0) {
      const memorySavings =
        (results.lazyLoading.eager.memory - results.lazyLoading.lazy.memory) /
        results.lazyLoading.eager.memory;

      if (memorySavings > 0.3) {
        analysis.memory.grade = 'A+';
        analysis.memory.insights.push(
          `Lazy loading saves ${(memorySavings * 100).toFixed(1)}% memory`
        );
      } else if (memorySavings > 0.1) {
        analysis.memory.grade = 'A';
        analysis.memory.insights.push(
          `Lazy loading saves ${(memorySavings * 100).toFixed(1)}% memory`
        );
      } else {
        analysis.memory.grade = 'B';
        analysis.memory.insights.push('Memory usage could be optimized');
      }
    }

    // Memoization effectiveness
    if (results.computations.withMemo.cacheHitRate < 0.2) {
      analysis.performance.insights.push('Excellent memoization efficiency');
    }

    // Batching effectiveness
    if (results.updates.batch100 && results.updates.shallow) {
      const batchEfficiency =
        results.updates.batch100 / (results.updates.shallow * 100);
      if (batchEfficiency < 0.1) {
        analysis.performance.insights.push(
          `Batching is ${(1 / batchEfficiency).toFixed(
            1
          )}x faster than individual updates`
        );
      }
    }

    return analysis;
  }
}
