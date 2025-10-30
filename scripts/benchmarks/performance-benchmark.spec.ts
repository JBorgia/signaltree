import { PerformanceBenchmark } from './performance-benchmark';

describe('PerformanceBenchmark', () => {
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    benchmark = new PerformanceBenchmark();
  });

  describe('Basic functionality', () => {
    it('should run a simple benchmark', () => {
      let counter = 0;
      const result = benchmark.benchmark(
        'Counter Test',
        () => {
          counter++;
        },
        10
      );

      expect(result.testName).toBe('Counter Test');
      expect(result.operations).toBe(10);
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.opsPerSecond).toBeGreaterThan(0);
      expect(counter).toBe(20); // 10 warmup + 10 actual
    });

    it('should create deep nested objects', () => {
      const obj = benchmark.createDeepObject(3);

      expect(obj).toHaveProperty('level3');
      expect(obj['level3']).toHaveProperty('level2');
      // Deep nesting verified
    });

    it('should create wide objects', () => {
      const obj = benchmark.createWideObject(5);

      expect(Object.keys(obj)).toHaveLength(5);
      expect(obj).toHaveProperty('prop0');
      expect(obj).toHaveProperty('prop4');
      expect(obj['prop0']).toEqual({
        value: 0,
        text: 'property-0',
        nested: { inner: 0 },
      });
    });
  });

  describe('Performance suite', () => {
    it('should run comprehensive performance suite', () => {
      const suite = benchmark.runComprehensiveSuite();

      expect(suite.name).toBe('SignalTree Performance Suite');
      expect(suite.results).toHaveLength(6);
      expect(suite.totalTime).toBeGreaterThan(0);

      // Check that all expected tests are present
      const testNames = suite.results.map((r) => r.testName);
      expect(testNames).toContain('Basic SignalTree Creation');
      expect(testNames).toContain('Deep Nesting (10 levels)');
      expect(testNames).toContain('Wide Object (50 properties)');
      expect(testNames).toContain('Deep Signal Access');
      expect(testNames).toContain('Signal Updates');
      expect(testNames).toContain('Tree Unwrap');
    });

    it('should generate performance report', () => {
      const suite = benchmark.runComprehensiveSuite();
      const report = benchmark.generateReport(suite);

      expect(report).toContain('=== SignalTree Performance Suite ===');
      expect(report).toContain('Total Suite Time:');
      expect(report).toContain('Average:');
      expect(report).toContain('Ops/sec:');
    });
  });

  describe('Performance validation', () => {
    it('should maintain reasonable performance for basic operations', () => {
      const result = benchmark.benchmark(
        'Basic Creation Performance',
        () => {
          const tree = benchmark.createDeepObject(5);
          expect(tree).toBeDefined();
        },
        50
      );

      // Should complete basic operations in reasonable time
      expect(result.avgTime).toBeLessThan(10); // Less than 10ms average
      expect(result.opsPerSecond).toBeGreaterThan(100); // At least 100 ops/sec
    });
  });
});
