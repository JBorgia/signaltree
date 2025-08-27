#!/usr/bin/env node
/**
 * Consolidated Performance Comparison Suite
 * - Runs recursive-performance.js multiple times and aggregates stats
 * - Parses bundle-size-report for gzipped sizes into a table
 * - Times demo NgRx vs SignalTree test suites to compare overhead
 */

import { spawnSync } from 'child_process';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    code: res.status ?? 0,
    out: (res.stdout || '') + (res.stderr || ''),
  };
}

function parseRecursiveOutput(out) {
  const lines = out.split(/\r?\n/);
  const metrics = {};

  // Parse both old format and new format
  const avgRe = /(Basic|Medium|Extreme|Unlimited).*?:\s*([0-9.]+)ms\s*avg/i;
  const signalTreeRe =
    /(Basic|Medium|Extreme|Unlimited).*?SignalTree:\s*([0-9.]+)ms\s*avg/i;

  for (const line of lines) {
    // Try new format first (SignalTree specific)
    let m = line.match(signalTreeRe);
    if (m) {
      const key = m[1].toLowerCase();
      const val = Number(m[2]);
      if (!Number.isNaN(val)) metrics[key] = val;
      continue;
    }

    // Fall back to old format
    m = line.match(avgRe);
    if (m) {
      const key = m[1].toLowerCase();
      const val = Number(m[2]);
      if (!Number.isNaN(val)) metrics[key] = val;
    }
  }
  return metrics; // { basic, medium, extreme, unlimited }
}

function stats(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / (n || 1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n || 1);
  const stddev = Math.sqrt(variance);
  return { runs: n, mean, min, max, stddev };
}

function fmt(n) {
  return typeof n === 'number' ? Number(n.toFixed(3)) : n;
}

function parseBundleReport(out) {
  const packages = [];
  const blocks = out.split('📦 ').slice(1); // split by package marker
  for (const block of blocks) {
    const nameLine = block.split(/\r?\n/)[0].trim().replace(':', '');
    const gzMatch = block.match(/Gzipped:\s*([0-9.]+)KB/i);
    if (gzMatch) {
      packages.push({ package: nameLine, gzippedKB: Number(gzMatch[1]) });
    }
  }
  return packages;
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
    const parsed = parseRecursiveOutput(out);
    for (const k of Object.keys(buckets)) {
      if (parsed[k] != null) buckets[k].push(parsed[k]);
    }
  }

  const recursiveTable = Object.entries(buckets).map(([k, vals]) => ({
    metric: k,
    runs: vals.length,
    mean_ms: fmt(stats(vals).mean),
    min_ms: fmt(stats(vals).min),
    max_ms: fmt(stats(vals).max),
    stddev_ms: fmt(stats(vals).stddev),
  }));

  console.log('\nRecursive Performance (ms):');
  console.table(recursiveTable);

  // 2) Bundle size report
  const bundle = run('node', ['scripts/bundle-size-report.js']);
  const sizes = parseBundleReport(bundle.out);
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
      duration_ms: fmt(demoPerf.ms),
      exit: demoPerf.code,
    },
    {
      label: 'Core Performance Tests',
      duration_ms: fmt(corePerf.ms),
      exit: corePerf.code,
    },
  ]);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
