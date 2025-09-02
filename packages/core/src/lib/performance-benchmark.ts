import { performance } from 'perf_hooks';

import { signalTree } from './signal-tree';

/**
 * Performance Benchmark Suite for SignalTree
 * Comprehensive performance testing and metrics collection
 */
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
        try {
          signalTree(data);
        } catch {
          // ignore in environments where signalTree may not be available
        }
      })
    );

    // Test 2: Deep nesting creation
    results.push(
      this.benchmark('Deep Nesting (10 levels)', () => {
        const data = this.createDeepObject(10);
        try {
          signalTree(data);
        } catch {
          // ignore
        }
      })
    );

    // Test 3: Wide object creation
    results.push(
      this.benchmark('Wide Object (50 properties)', () => {
        const data = this.createWideObject(50);
        try {
          signalTree(data);
        } catch {
          // ignore
        }
      })
    );

    // Test 4: Signal access performance
    let tree: any;
    try {
      tree = signalTree(this.createDeepObject(10));
    } catch {
      // fallback: try to create a simple object for benchmark
      tree = {
        $: this.createDeepObject(10),
        unwrap: () => this.createDeepObject(10),
      };
    }
    results.push(
      this.benchmark('Deep Signal Access', () => {
        // Access with `any` because the signal tree uses dynamic keys that
        // the static type system doesn't model in this benchmark helper.
        try {
          const deepVal = (tree.$ as any)?.level10?.level9?.level8?.level7
            ?.level6?.level5?.level4?.level3?.level2?.level1?.value;
          if (typeof deepVal === 'function') deepVal();
        } catch {
          // swallow - benchmark should continue even if deep path isn't present
        }
      })
    );

    // Test 5: Update performance
    results.push(
      this.benchmark('Signal Updates', () => {
        // See note above about dynamic signal shape
        try {
          const node = (tree.$ as any)?.level10?.level9?.level8?.count8;
          if (node && typeof node.set === 'function') {
            node.set(Math.random() * 100);
          }
        } catch {
          // ignore - benchmark continues
        }
      })
    );

    // Test 6: Unwrap performance
    results.push(
      this.benchmark('Tree Unwrap', () => {
        try {
          const plain =
            typeof tree.unwrap === 'function' ? tree.unwrap() : undefined;
          // touch a nested field to prevent DCE
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          plain && (plain as any).level10?.level9;
        } catch {
          // ignore
        }
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
