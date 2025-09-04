#!/usr/bin/env node
/**
 * Consolidated Performance Comparison Suite
 * - Runs recursive-performance.js multiple times and aggregates stats
 * - Parses bundle-size-report for gzipped sizes into a table
 * - Times demo NgRx vs SignalTree test suites to compare overhead
 */

const { spawnSync } = require('child_process');
const metrics = require('../lib/metrics.cjs');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    code: res.status ?? 0,
    out: (res.stdout || '') + (res.stderr || ''),
  };
}

function timeCommand(label, cmd, args) {
  const start = process.hrtime.bigint();
  const res = run(cmd, args, { stdio: 'pipe' });
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return { label, ms, code: res.code };
}

async function main() {
  console.log('=== SignalTree Consolidated Performance Suite ===');

  // 1) Recursive performance multiple runs
  const iterations = Number(process.env.RUNS || 5);
  const buckets = { basic: [], medium: [], extreme: [], unlimited: [] };

  for (let i = 0; i < iterations; i++) {
    const { out, code } = run('node', [
      'scripts/performance/recursive-performance.js',
    ]);
    if (code !== 0) {
      console.error('recursive-performance failed');
      process.exit(code);
    }
    const parsed = metrics.parseRecursiveOutput(out);
    for (const k of Object.keys(buckets)) {
      if (parsed[k] != null) buckets[k].push(parsed[k]);
    }
  }

  const recursiveTable = Object.entries(buckets).map(([k, vals]) => ({
    metric: k,
    runs: vals.length,
    mean_ms: metrics.fmt(metrics.stats(vals).mean),
    min_ms: metrics.fmt(metrics.stats(vals).min),
    max_ms: metrics.fmt(metrics.stats(vals).max),
    stddev_ms: metrics.fmt(metrics.stats(vals).stddev),
  }));

  console.log('\nRecursive Performance (ms):');
  console.table(recursiveTable);

  // 2) Bundle size report
  const bundle = run('node', ['scripts/consolidated-bundle-analysis.js']);
  const sizes = metrics.parseBundleReport(bundle.out);
  console.log('\nBundle Sizes (gzipped KB):');
  console.table(sizes);

  // 3) Demo performance tests (now working!)
  console.log('\nRunning Demo Performance Tests...');
  const demoPerf = timeCommand('Demo Performance Tests', 'pnpm', [
    'nx',
    'test',
    'demo',
    '--skip-nx-cache',
    '--testPathPattern=signaltree-performance',
  ]);

  // 4) Core package performance test (comprehensive tests)
  console.log('\nRunning Core Performance Tests...');
  const corePerf = timeCommand('Core Performance Tests', 'pnpm', [
    'nx',
    'test',
    'core',
    '--skip-nx-cache',
    '--testNamePattern=Recursive Performance',
  ]);

  console.log('\nTest Suite Timings (ms):');
  console.table([
    {
      label: 'Demo Performance Tests',
      duration_ms: metrics.fmt(demoPerf.ms),
      exit: demoPerf.code,
    },
    {
      label: 'Core Performance Tests',
      duration_ms: metrics.fmt(corePerf.ms),
      exit: corePerf.code,
    },
  ]);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
