#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  macroLatestPath,
  macroMedianPath,
  macroHistoryDir,
  ensurePerformanceDirs,
} from './paths.mjs';

// Basic regression detection using Phase0 baseline (if extended metrics added later, adapt diff logic)
const PERF_SLOWDOWN_THRESHOLD_PCT = parseFloat(
  process.env.BENCH_SLOW_PCT || '12'
);
// Per-case slowdown threshold (percentage) default 15%, override via env
const CASE_SLOW_PCT = parseFloat(process.env.BENCH_CASE_SLOW_PCT || '15');
// Minimum absolute ms increase to consider (noise filter)
const CASE_MIN_ABS_MS = parseFloat(process.env.BENCH_CASE_MIN_ABS_MS || '0.05');
// Variability (coefficient of variation %) threshold for warning/failure
const CASE_COV_WARN_PCT = parseFloat(
  process.env.BENCH_CASE_COV_WARN_PCT || '20'
);
const CASE_COV_FAIL_PCT = parseFloat(
  process.env.BENCH_CASE_COV_FAIL_PCT || '35'
);
const FAIL_ON_VAR = process.env.BENCH_VAR_FAIL === '1';
// Use median file if present or explicitly requested
const USE_MEDIAN = process.env.BENCH_USE_MEDIAN === '1';
const REPORT_FILE = process.env.BENCH_REPORT_FILE || 'benchmark-report.json';

// Future: thresholds will be applied when baseline perf numbers stored

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

ensurePerformanceDirs();
const perfDir = path.join(process.cwd(), 'performance');
// Allow alternate filename (for historical comparisons) but default to macro latest path
const alt = process.env.LATEST_BENCHMARK_FILE;
const latestPath =
  alt && alt.trim() ? path.join(perfDir, alt.trim()) : macroLatestPath();
const baselinePath = path.join(perfDir, 'baselines/macro/baseline.json');

if (!fs.existsSync(latestPath)) {
  console.error('Latest benchmark not found. Run run-benchmark.mjs first.');
  process.exit(1);
}

let latest = loadJSON(latestPath);
// Swap in median summary if requested and available
const medianPath = macroMedianPath();
if ((USE_MEDIAN || process.env.CI) && fs.existsSync(medianPath)) {
  try {
    latest = loadJSON(medianPath);
    console.log('ℹ️ Using median benchmark summary');
  } catch {
    // ignore
  }
}
const baselineSize = loadJSON(baselinePath); // { core: { rawBytes, gzipBytes } }

const failures = [];

// Compare if baseline has a legacy simple shape or new schema
const latestCases = latest.cases || [];
const medianSourceRuns = latest.sourceRuns || [];
const medianSourceCaseRuns = latest.sourceCaseRuns || [];

if (latestCases.length === 0) {
  console.warn('No benchmark cases in latest results.');
}

// Optional size regression check if env provides CURRENT_GZIP_BYTES
const currentGzip = process.env.CURRENT_GZIP_BYTES
  ? parseInt(process.env.CURRENT_GZIP_BYTES, 10)
  : undefined;
const baselineGzip = baselineSize.gzipBytes || baselineSize.core?.gzipBytes;
if (currentGzip && baselineGzip) {
  const pct = ((currentGzip - baselineGzip) / baselineGzip) * 100;
  if (pct > 2) {
    failures.push(`Gzip size increased ${pct.toFixed(2)}% (>2%)`);
  }
}

// Very coarse perf slowdown heuristic: compare aggregate totalMs vs previous snapshot if provided
let previousFile = process.env.PREV_BENCH_FILE;
// Auto-pick previous snapshot (lexicographically latest earlier json matching pattern phase*.json) if not provided
if (!previousFile) {
  try {
    const historyDir = macroHistoryDir();
    const files = fs
      .readdirSync(historyDir)
      .filter((f) => /benchmark-median-.*\.json$/i.test(f));
    // Use timestamp inside file for ordering if available
    const snapshots = files.map((f) => {
      try {
        const data = loadJSON(path.join(perfDir, f));
        return { f, ts: Date.parse(data.timestamp || '') || 0 };
      } catch {
        return { f, ts: 0 };
      }
    });
    snapshots.sort((a, b) => b.ts - a.ts);
    previousFile = snapshots[0]?.f
      ? path.join(historyDir, snapshots[0].f)
      : undefined;
  } catch {
    // ignore
  }
}
if (previousFile) {
  const prev = loadJSON(previousFile);
  if (prev?.totals?.totalMs && latest?.totals?.totalMs) {
    const pct =
      ((latest.totals.totalMs - prev.totals.totalMs) / prev.totals.totalMs) *
      100;
    if (pct > PERF_SLOWDOWN_THRESHOLD_PCT) {
      failures.push(
        `Total benchmark time +${pct.toFixed(
          2
        )}% (> ${PERF_SLOWDOWN_THRESHOLD_PCT}%) vs ${previousFile}`
      );
    }
  }
}

// Per-case slowdown checks
if (previousFile) {
  const prev = loadJSON(previousFile);
  const prevCases = prev.cases || [];
  const prevMap = new Map(prevCases.map((c) => [c.name, c]));
  for (const c of latestCases) {
    const prior = prevMap.get(c.name);
    if (!prior) continue;
    const deltaMs = c.totalMs - prior.totalMs;
    const pct = ((c.totalMs - prior.totalMs) / prior.totalMs) * 100;
    if (deltaMs > CASE_MIN_ABS_MS && pct > CASE_SLOW_PCT) {
      failures.push(
        `Case '${c.name}' regression: +${deltaMs.toFixed(3)}ms (+${pct.toFixed(
          1
        )}% > ${CASE_SLOW_PCT}%, minAbs ${CASE_MIN_ABS_MS}ms)`
      );
    }
  }
}

// Variability analysis (only if median source case runs available)
const variabilityWarnings = [];
if (medianSourceCaseRuns.length) {
  const byCase = new Map();
  for (const run of medianSourceCaseRuns) {
    for (const c of run.cases) {
      if (!byCase.has(c.name)) byCase.set(c.name, []);
      byCase.get(c.name).push(c.totalMs);
    }
  }
  for (const [name, vals] of byCase.entries()) {
    if (vals.length < 2) continue;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance =
      vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (vals.length - 1);
    const stdev = Math.sqrt(variance);
    const covPct = (stdev / mean) * 100;
    if (covPct > CASE_COV_WARN_PCT) {
      const msg = `Case '${name}' high variability: cov=${covPct.toFixed(
        1
      )}% (warn>${CASE_COV_WARN_PCT}%)`;
      if (covPct > CASE_COV_FAIL_PCT && FAIL_ON_VAR) {
        failures.push(msg + ` fail>${CASE_COV_FAIL_PCT}%`);
      } else {
        variabilityWarnings.push(msg);
      }
    }
  }
}

// Placeholder: we could fail if schema version mismatch
if (latest.schemaVersion && latest.schemaVersion !== 1) {
  failures.push(
    'Unsupported benchmark schema version: ' + latest.schemaVersion
  );
}

// Report summary
// Write optional report JSON
try {
  const report = {
    timestamp: new Date().toISOString(),
    usingMedian: !!medianSourceRuns.length,
    previousFile: previousFile ? path.basename(previousFile) : null,
    failures,
    variabilityWarnings,
    totals: latest.totals || null,
  };
  fs.writeFileSync(
    path.join(perfDir, REPORT_FILE),
    JSON.stringify(report, null, 2)
  );
} catch {
  // report write optional
}

if (failures.length) {
  console.error('❌ Benchmark regressions detected:');
  failures.forEach((f) => console.error(' -', f));
  if (variabilityWarnings.length) {
    console.error('⚠️ Variability warnings:');
    variabilityWarnings.forEach((w) => console.error(' -', w));
  }
  process.exit(1);
} else {
  console.log('✅ No benchmark threshold failures');
  if (variabilityWarnings.length) {
    console.log('⚠️ Variability warnings:');
    variabilityWarnings.forEach((w) => console.log(' -', w));
  }
}
