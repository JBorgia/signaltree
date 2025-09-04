#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const metrics = require('../lib/metrics.cjs');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    code: res.status ?? 0,
    out: (res.stdout || '') + (res.stderr || ''),
  };
}

// Use shared metrics helpers from scripts/lib/metrics.cjs

async function main() {
  const iterations = Number(process.env.RUNS || 3);
  const buckets = { basic: [], medium: [], extreme: [], unlimited: [] };
  for (let i = 0; i < iterations; i++) {
    const r = run('node', ['scripts/performance/recursive-performance.js']);
    if (r.code !== 0) {
      console.error('recursive failed');
      process.exit(r.code);
    }
    const parsed = metrics.parseRecursiveOutput(r.out);
    for (const k of Object.keys(buckets))
      if (parsed[k] != null) buckets[k].push(parsed[k]);
  }
  console.log('Recursive aggregated:');
  const table = Object.entries(buckets).map(([k, vals]) => {
    const s = metrics.stats(vals) || {
      runs: 0,
      mean: null,
      min: null,
      max: null,
      stddev: null,
    };
    return {
      metric: k,
      runs: s.runs,
      mean_ms: metrics.fmt(s.mean),
      min_ms: metrics.fmt(s.min),
      max_ms: metrics.fmt(s.max),
      stddev_ms: metrics.fmt(s.stddev),
    };
  });
  console.table(table);
}

main();
