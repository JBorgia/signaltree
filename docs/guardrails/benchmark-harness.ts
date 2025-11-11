/**
 * Benchmark Harness for SignalTree Guardrails v1.1
 * 
 * Validates overhead targets:
 * - Median < 0.5ms
 * - P95 < 0.8ms
 * - Max < 1.2ms
 * 
 * Usage:
 *   npx ts-node benchmark-harness.ts
 */

// @ts-nocheck
import { signalTree } from '@signaltree/core';
import { withGuardrails } from './guardrails-v1.1-enhanced';

interface BenchmarkResult {
  scenario: string;
  samples: number;
  baseline: PerformanceMetrics;
  withGuardrails: PerformanceMetrics;
  overhead: OverheadMetrics;
}

interface PerformanceMetrics {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

interface OverheadMetrics {
  p50Pct: number;
  p95Pct: number;
  maxPct: number;
  avgPct: number;
}

// ============================================
// Scenarios
// ============================================

const scenarios = [
  {
    name: 'Rapid Counter Updates',
    setup: () => signalTree({ count: 0 }),
    run: (tree: any, iterations: number) => {
      for (let i = 0; i < iterations; i++) {
        tree.$.count.set(i);
      }
    },
  },
  {
    name: 'Deep Tree Structural Diff',
    setup: () => signalTree({ level1: { level2: { level3: { value: 0 } } } }),
    run: (tree: any, iterations: number) => {
      for (let i = 0; i < iterations; i++) {
        tree.update({ level1: { level2: { level3: { value: i } } } });
      }
    },
  },
  {
    name: 'Burst Writes (100 updates)',
    setup: () => signalTree({ items: [] as number[] }),
    run: (tree: any, iterations: number) => {
      for (let i = 0; i < iterations / 100; i++) {
        for (let j = 0; j < 100; j++) {
          tree.$.items.set([...tree.$.items(), j]);
        }
      }
    },
  },
  {
    name: 'Large Payload Swap',
    setup: () => signalTree({ data: Array(100).fill({ id: 1, value: 'test' }) }),
    run: (tree: any, iterations: number) => {
      for (let i = 0; i < iterations; i++) {
        tree.$.data.set(Array(100).fill({ id: i, value: `test-${i}` }));
      }
    },
  },
  {
    name: 'Mixed Read/Write with Suppression',
    setup: () => signalTree({ counter: 0, cache: {} }),
    run: (tree: any, iterations: number) => {
      for (let i = 0; i < iterations; i++) {
        tree.$.counter.set(i);
        if (i % 10 === 0) {
          tree.update({ cache: { [`key-${i}`]: i } }, { suppressGuardrails: true });
        }
      }
    },
  },
  {
    name: 'Idle Baseline (no updates)',
    setup: () => signalTree({ value: 0 }),
    run: (tree: any, iterations: number) => {
      // No updates - measures baseline noise
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Busy wait to simulate processing
      }
    },
  },
];

// ============================================
// Benchmark Runner
// ============================================

function calculatePercentiles(samples: number[]): PerformanceMetrics {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: samples.reduce((sum, v) => sum + v, 0) / samples.length || 0,
  };
}

function runScenario(scenario: any, iterations: number, warmup: number): BenchmarkResult {
  const baselineTimings: number[] = [];
  const guardrailsTimings: number[] = [];
  
  // Baseline (no guardrails)
  console.log(`  Warming up baseline (${warmup} iterations)...`);
  const baselineTree = scenario.setup();
  scenario.run(baselineTree, warmup);  // warmup
  
  console.log(`  Running baseline (${iterations} iterations)...`);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    scenario.run(baselineTree, 1);
    baselineTimings.push(performance.now() - start);
  }
  
  // With guardrails
  console.log(`  Warming up with guardrails (${warmup} iterations)...`);
  const guardrailsTree = scenario.setup().with(withGuardrails({
    budgets: { maxUpdateTime: 16 },
    hotPaths: { threshold: 10 },
    reporting: { console: false },
  }));
  scenario.run(guardrailsTree, warmup);  // warmup
  
  console.log(`  Running with guardrails (${iterations} iterations)...`);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    scenario.run(guardrailsTree, 1);
    guardrailsTimings.push(performance.now() - start);
  }
  
  const baseline = calculatePercentiles(baselineTimings);
  const withGuardrails = calculatePercentiles(guardrailsTimings);
  
  return {
    scenario: scenario.name,
    samples: iterations,
    baseline,
    withGuardrails,
    overhead: {
      p50Pct: ((withGuardrails.p50 - baseline.p50) / baseline.p50) * 100,
      p95Pct: ((withGuardrails.p95 - baseline.p95) / baseline.p95) * 100,
      maxPct: ((withGuardrails.max - baseline.max) / baseline.max) * 100,
      avgPct: ((withGuardrails.avg - baseline.avg) / baseline.avg) * 100,
    },
  };
}

function printResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80) + '\n');
  
  results.forEach(result => {
    console.log(`Scenario: ${result.scenario}`);
    console.log(`  Baseline   - P50: ${result.baseline.p50.toFixed(3)}ms  P95: ${result.baseline.p95.toFixed(3)}ms  Max: ${result.baseline.max.toFixed(3)}ms`);
    console.log(`  Guardrails - P50: ${result.withGuardrails.p50.toFixed(3)}ms  P95: ${result.withGuardrails.p95.toFixed(3)}ms  Max: ${result.withGuardrails.max.toFixed(3)}ms`);
    console.log(`  Overhead   - P50: ${result.overhead.p50Pct.toFixed(1)}%     P95: ${result.overhead.p95Pct.toFixed(1)}%     Max: ${result.overhead.maxPct.toFixed(1)}%`);
    console.log('');
  });
  
  // Summary
  const avgP50Overhead = results.reduce((sum, r) => sum + r.overhead.p50Pct, 0) / results.length;
  const avgP95Overhead = results.reduce((sum, r) => sum + r.overhead.p95Pct, 0) / results.length;
  const maxOverhead = Math.max(...results.map(r => r.overhead.maxPct));
  
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Average P50 Overhead: ${avgP50Overhead.toFixed(1)}%`);
  console.log(`Average P95 Overhead: ${avgP95Overhead.toFixed(1)}%`);
  console.log(`Max Overhead (any scenario): ${maxOverhead.toFixed(1)}%`);
  console.log('');
  
  // Pass/Fail
  const targets = {
    p50: 0.5,  // <0.5ms absolute overhead
    p95: 0.8,  // <0.8ms absolute overhead
  };
  
  const passes = results.every(r => {
    const p50Delta = r.withGuardrails.p50 - r.baseline.p50;
    const p95Delta = r.withGuardrails.p95 - r.baseline.p95;
    return p50Delta < targets.p50 && p95Delta < targets.p95;
  });
  
  console.log('TARGETS:');
  console.log(`  P50 Overhead < ${targets.p50}ms: ${passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  P95 Overhead < ${targets.p95}ms: ${passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('SignalTree Guardrails v1.1 Benchmark Harness\n');
  
  const ITERATIONS = 1000;
  const WARMUP = 200;
  
  const results: BenchmarkResult[] = [];
  
  for (const scenario of scenarios) {
    console.log(`\nRunning: ${scenario.name}`);
    const result = runScenario(scenario, ITERATIONS, WARMUP);
    results.push(result);
  }
  
  printResults(results);
  
  // Optional: Export JSON
  // fs.writeFileSync('benchmark-results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
