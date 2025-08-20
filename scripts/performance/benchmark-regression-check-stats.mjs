#!/usr/bin/env node
/**
 * Regression check using median + stddev thresholds.
 * Baseline file: baseline-micro-bench-stats.json
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  microLatestPath,
  microBaselinePath,
  microBaselineWriteTargets,
} from './paths.mjs';

const engine = 'angular';
const latestPath = microLatestPath(engine);
const baselinePath = microBaselinePath(engine);
const baselineTargets = microBaselineWriteTargets(engine);
const slowdownPct = Number(process.env.MEDIAN_SLOWDOWN_PCT || 5);
const stddevIncreasePct = Number(process.env.STDDEV_INCREASE_PCT || 15);
const updateBaseline = process.argv.includes('--update-baseline');

function ensureLatest() {
  try {
    readFileSync(latestPath);
  } catch {
    console.log('[bench-stats] generating latest stats...');
    execSync('node scripts/performance/micro-benchmarks-variance.mjs', {
      stdio: 'inherit',
    });
  }
}
function load(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function writeBaseline(data) {
  // ensure organized dir
  try {
    mkdirSync(path.dirname(baselineTargets.organized), { recursive: true });
  } catch {
    /* ignore */
  }
  writeFileSync(baselineTargets.organized, JSON.stringify(data, null, 2));
  if (baselineTargets.organized !== baselineTargets.legacy) {
    try {
      writeFileSync(baselineTargets.legacy, JSON.stringify(data, null, 2));
    } catch {
      /* ignore legacy mirror */
    }
  }
}

ensureLatest();
const latest = load(latestPath);
if (
  !latest ||
  Object.keys(latest).length === 0 ||
  !Array.isArray(latest.results) ||
  latest.results.length === 0
) {
  console.error(
    '[bench-stats] Latest stats file is empty or missing results. Expected performance/results/micro/angular/latest.json'
  );
  process.exit(1);
}
if (updateBaseline) {
  writeBaseline(latest);
  console.log('[bench-stats] baseline updated.');
  process.exit(0);
}
let baseline;
try {
  baseline = load(baselinePath);
} catch {
  writeBaseline(latest);
  console.log('[bench-stats] created new baseline.');
  process.exit(0);
}
if (
  !baseline ||
  Object.keys(baseline).length === 0 ||
  !Array.isArray(baseline.results) ||
  baseline.results.length === 0
) {
  writeBaseline(latest);
  console.log('[bench-stats] baseline was empty; replaced with latest.');
  process.exit(0);
}

const baseIdx = new Map(baseline.results.map((r) => [r.label, r]));
const currIdx = new Map(latest.results.map((r) => [r.label, r]));

const rows = [];
let failures = 0;
for (const [label, base] of baseIdx.entries()) {
  const cur = currIdx.get(label);
  if (!cur) {
    rows.push({ label, status: 'missing' });
    continue;
  }
  const medianDeltaPct = ((cur.median - base.median) / base.median) * 100;
  const stddevDeltaPct =
    base.stddev === 0 ? 0 : ((cur.stddev - base.stddev) / base.stddev) * 100;
  const medianFail = medianDeltaPct > slowdownPct;
  const stddevFail = stddevDeltaPct > stddevIncreasePct;
  if (medianFail || stddevFail) failures++;
  rows.push({
    label,
    baseMedian: base.median,
    curMedian: cur.median,
    medianDeltaPct,
    baseStddev: base.stddev,
    curStddev: cur.stddev,
    stddevDeltaPct,
    status:
      medianFail || stddevFail
        ? 'REGRESSION'
        : medianDeltaPct < 0
        ? 'improved'
        : 'ok',
  });
}

rows.sort((a, b) => a.label.localeCompare(b.label));
console.log(
  `\nBenchmark Stats Regression (median>${slowdownPct}% || stddev>${stddevIncreasePct}%)`
);
console.table(
  rows.map((r) => ({
    metric: r.label,
    baseMedian: r.baseMedian?.toFixed?.(6),
    curMedian: r.curMedian?.toFixed?.(6),
    medianDeltaPct: r.medianDeltaPct?.toFixed?.(2) + '%',
    baseStddev: r.baseStddev?.toFixed?.(6),
    curStddev: r.curStddev?.toFixed?.(6),
    stddevDeltaPct: r.stddevDeltaPct?.toFixed?.(2) + '%',
    status: r.status,
  }))
);

if (failures) {
  console.error(
    `[bench-stats] FAILURE: ${failures} metric(s) exceeded thresholds.`
  );
  process.exit(1);
}
console.log('[bench-stats] Success: no median/stddev regressions.');
process.exit(0);
