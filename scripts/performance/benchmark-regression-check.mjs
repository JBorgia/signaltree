#!/usr/bin/env node
/**
 * Benchmark Regression Guard
 *
 * Compares the most recent micro benchmark results against a stored baseline
 * and fails (exit code 1) if any common metric regresses beyond the allowed
 * slowdown threshold (default 5%).
 *
 * Usage:
 *   node scripts/performance/benchmark-regression-check.mjs          # run check
 *   node scripts/performance/benchmark-regression-check.mjs --update-baseline  # refresh baseline
 *
 * Env / Flags:
 *   MAX_SLOWDOWN_PCT   (number, default 5) allowed % slowdown per metric
 *   --update-baseline  replace baseline with latest results
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const latestPath = path.resolve(
  ROOT,
  'scripts/performance/latest-micro-bench.json'
);
const baselinePath = path.resolve(
  ROOT,
  'scripts/performance/baseline-micro-bench.json'
);
const threshold = Number(process.env.MAX_SLOWDOWN_PCT || 5);
const updateBaseline = process.argv.includes('--update-baseline');

function ensureLatest() {
  try {
    readFileSync(latestPath);
  } catch {
    console.log(
      '[bench-check] Running micro benchmarks to produce latest file...'
    );
    execSync('node scripts/performance/micro-benchmarks.mjs', {
      stdio: 'inherit',
    });
  }
}

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeBaseline(data) {
  writeFileSync(baselinePath, JSON.stringify(data, null, 2));
}

function indexResults(arr) {
  const map = new Map();
  for (const r of arr) map.set(r.label, r);
  return map;
}

ensureLatest();
const latest = loadJson(latestPath);

if (updateBaseline) {
  writeBaseline(latest);
  console.log(
    `[bench-check] Baseline updated with ${latest.results.length} metrics.`
  );
  process.exit(0);
}

let baseline;
try {
  baseline = loadJson(baselinePath);
} catch {
  writeBaseline(latest);
  console.log(
    '[bench-check] No baseline found. Created new baseline from latest results.'
  );
  process.exit(0);
}

const latestIdx = indexResults(latest.results);
const baseIdx = indexResults(baseline.results);

const comparison = [];
let failures = 0;

for (const [label, base] of baseIdx.entries()) {
  const current = latestIdx.get(label);
  if (!current) {
    comparison.push({
      label,
      baseline: base.ms,
      latest: null,
      deltaPct: null,
      status: 'missing',
    });
    continue;
  }
  const delta = current.ms - base.ms;
  const deltaPct = base.ms === 0 ? 0 : (delta / base.ms) * 100;
  const slowed = deltaPct > threshold;
  if (slowed) failures++;
  comparison.push({
    label,
    baseline: base.ms,
    latest: current.ms,
    deltaPct,
    status: slowed ? 'REGRESSION' : deltaPct < 0 ? 'improved' : 'ok',
  });
}

// Include any new metrics not in baseline
for (const [label, cur] of latestIdx.entries()) {
  if (!baseIdx.has(label)) {
    comparison.push({
      label,
      baseline: null,
      latest: cur.ms,
      deltaPct: null,
      status: 'new',
    });
  }
}

comparison.sort((a, b) => a.label.localeCompare(b.label));

function fmt(n) {
  return n == null ? '-' : n.toFixed(6);
}
function fmtPct(n) {
  return n == null ? '-' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

console.log('\nBenchmark Regression Report (threshold ' + threshold + '%)');
console.log('='.repeat(64));
console.table(
  comparison.map((c) => ({
    metric: c.label,
    baseline: fmt(c.baseline),
    latest: fmt(c.latest),
    deltaPct: fmtPct(c.deltaPct),
    status: c.status,
  }))
);

if (failures > 0) {
  console.error(
    `\n[bench-check] FAILURE: ${failures} metric(s) exceeded slowdown threshold (${threshold}%).`
  );
  console.error(
    'Use --update-baseline to accept new performance if intentional.'
  );
  process.exit(1);
}

console.log('\n[bench-check] Success: No regressions beyond threshold.');
process.exit(0);
