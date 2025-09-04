import { computed, Injectable, signal } from '@angular/core';
import { withBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';

/**
 * @fileoverview Comprehensive benchmarking suite for SignalTree Demo
 * Measures performance, memory usage, and compares with alternatives
 */
/**
 * Performance measurement utilities
 */
@Injectable({
  providedIn: 'root',
})
export class BenchmarkService {
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
    if (typeof window !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }

  /**
   * Profile memory allocation
   */
  static profileMemory(
    fn: () => void
  ): { before: number; after: number; delta: number } | null {
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
   * Benchmark tree initialization with different sizes
   */
  benchmarkInitialization() {
    const results = {
      small: { nodes: 10, time: 0, memory: 0 },
      medium: { nodes: 100, time: 0, memory: 0 },
      large: { nodes: 1000, time: 0, memory: 0 },
    };

    // Small tree (10 nodes)
    const smallState = BenchmarkService.generateNestedState(2, 3);
    results.small.time = BenchmarkService.measureTime(() => {
      const tree = signalTree(smallState);
      tree();
    });

    const smallMemory = BenchmarkService.profileMemory(() => {
      const tree = signalTree(smallState);
      tree();
    });
    results.small.memory = smallMemory?.delta || 0;

    // Medium tree (100 nodes)
    const mediumState = BenchmarkService.generateNestedState(3, 5);
    results.medium.time = BenchmarkService.measureTime(() => {
      const tree = signalTree(mediumState);
      tree();
    });

    // Large tree (1000 nodes)
    const largeState = BenchmarkService.generateNestedState(4, 8);
    results.large.time = BenchmarkService.measureTime(() => {
      const tree = signalTree(largeState);
      tree();
    });

    return results;
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
      tree((state) => ({ ...state, topLevel: Math.random() }));
    });

    // Medium depth update
    results.medium = BenchmarkService.measureTime(() => {
      tree((state) => ({
        ...state,
        level_4_item_0: {
          ...state.level_4_item_0,
          level_3_item_0: { value: Math.random() },
        },
      }));
    });

    // Deep update
    results.deep = BenchmarkService.measureTime(() => {
      tree((state) => {
        const newState = { ...state };
        let current = newState;
        for (let i = 4; i > 0; i--) {
          current = current[`level_${i}_item_0`] = {
            ...current[`level_${i}_item_0`],
          };
        }
        current.value = Math.random();
        return newState;
      });
    });

    // Batch updates
    const batchTree = signalTree(state).with(withBatching());

    results.batch10 = BenchmarkService.measureTime(() => {
      (batchTree.$ as Record<string, unknown>)['batchUpdate']?.(
        (state: Record<string, unknown>) => {
          const updates: Record<string, unknown> = {};
          for (let i = 0; i < 10; i++) {
            updates[`field_${i}`] = Math.random();
          }
          return { ...state, ...updates };
        }
      );
    });

    results.batch100 = BenchmarkService.measureTime(() => {
      batchTree.$.batchUpdate((state) => {
        const updates: any = {};
        for (let i = 0; i < 100; i++) {
          updates[`field_${i}`] = Math.random();
        }
        return { ...state, ...updates };
      });
    });

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
      (eagerTree.$ as any).level_5_item_0.level_4_item_0.level_3_item_0();
    });

    // Lazy loading
    const lazyMemory = BenchmarkService.profileMemory(() => {
      const tree = signalTree(largeState, { useLazySignals: true });
      tree();
    });
    results.lazy.memory = lazyMemory?.delta || 0;

    const lazyTree = signalTree(largeState, { useLazySignals: true });
    results.lazy.accessTime = BenchmarkService.measureTime(() => {
      (lazyTree.$ as any).level_5_item_0.level_4_item_0.level_3_item_0();
    }, 100);

    results.lazy.secondAccess = BenchmarkService.measureTime(() => {
      (lazyTree.$ as any).level_5_item_0.level_4_item_0.level_3_item_0();
    });

    return results;
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
      stTree((state) => ({ ...state, value: Math.random() }));
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
