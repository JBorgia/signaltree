/**
 * Performance Benchmark Suite for SignalTree
 * Comprehensive performance testing and metrics collection
 */
import { signalTree } from './signal-tree';

export interface BenchmarkResult {
  testName: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  operations: number;
  opsPerSecond: number;
}

export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalTime: number;
}

export class PerformanceBenchmark {
  private warmupIterations = 10;
  private benchmarkIterations = 100;

  /**
   * Run a benchmark test with multiple iterations
   */
  benchmark(
    testName: string,
    testFn: () => void,
    iterations?: number
  ): BenchmarkResult {
    const actualIterations = iterations || this.benchmarkIterations;

    // Warmup
    for (let i = 0; i < this.warmupIterations; i++) {
      testFn();
    }

    // Actual benchmark
    const times: number[] = [];
    for (let i = 0; i < actualIterations; i++) {
      const start = performance.now();
      testFn();
      const end = performance.now();
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const opsPerSecond = 1000 / avgTime;

    return {
      testName,
      avgTime,
      minTime,
      maxTime,
      operations: actualIterations,
      opsPerSecond,
    };
  }

  /**
   * Create deep nested test data
   */
  createDeepObject(depth: number): Record<string, unknown> {
    if (depth <= 0) return { value: `leaf-${Math.random()}` };

    return {
      [`level${depth}`]: this.createDeepObject(depth - 1),
      [`data${depth}`]: Array.from(
        { length: 3 },
        (_, i) => `item-${depth}-${i}`
      ),
      [`count${depth}`]: depth * 10,
    };
  }

  /**
   * Create wide object with many properties
   */
  createWideObject(width: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < width; i++) {
      obj[`prop${i}`] = {
        value: i,
        text: `property-${i}`,
        nested: { inner: i * 2 },
      };
    }
    return obj;
  }

  /**
   * Run comprehensive performance suite
   */
  runComprehensiveSuite(): BenchmarkSuite {
    const results: BenchmarkResult[] = [];
    const suiteStart = performance.now();

    // Test 1: Basic creation
    results.push(
      this.benchmark('Basic SignalTree Creation', () => {
        const data = { count: 1, name: 'test' };
        signalTree(data);
      })
    );

    // Test 2: Deep nesting creation
    results.push(
      this.benchmark('Deep Nesting (10 levels)', () => {
        const data = this.createDeepObject(10);
        signalTree(data);
      })
    );

    // Test 3: Wide object creation
    results.push(
      this.benchmark('Wide Object (50 properties)', () => {
        const data = this.createWideObject(50);
        signalTree(data);
      })
    );

    // Test 4: Signal access performance
    const tree = signalTree(this.createDeepObject(10));
    results.push(
      this.benchmark('Deep Signal Access', () => {
        tree.$.level10.level9.level8.level7.level6.level5.level4.level3.level2.level1.value();
      })
    );

    // Test 5: Update performance
    results.push(
      this.benchmark('Signal Updates', () => {
        tree.$.level10.level9.level8.count8.set(Math.random() * 100);
      })
    );

    // Test 6: Unwrap performance
    results.push(
      this.benchmark('Tree Unwrap', () => {
        tree.unwrap.$();
      })
    );

    const suiteEnd = performance.now();

    return {
      name: 'SignalTree Performance Suite',
      results,
      totalTime: suiteEnd - suiteStart,
    };
  }

  /**
   * Generate performance report
   */
  generateReport(suite: BenchmarkSuite): string {
    let report = `\n=== ${suite.name} ===\n`;
    report += `Total Suite Time: ${suite.totalTime.toFixed(2)}ms\n\n`;

    suite.results.forEach((result) => {
      report += `${result.testName}:\n`;
      report += `  Average: ${result.avgTime.toFixed(3)}ms\n`;
      report += `  Range: ${result.minTime.toFixed(
        3
      )}ms - ${result.maxTime.toFixed(3)}ms\n`;
      report += `  Ops/sec: ${Math.round(
        result.opsPerSecond
      ).toLocaleString()}\n\n`;
    });

    return report;
  }
}
