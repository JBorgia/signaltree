#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Basic regression detection using Phase0 baseline (if extended metrics added later, adapt diff logic)
const PERF_SLOWDOWN_THRESHOLD_PCT = parseFloat(
  process.env.BENCH_SLOW_PCT || '12'
);

// Future: thresholds will be applied when baseline perf numbers stored

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const perfDir = path.join(process.cwd(), 'scripts/performance');
// Allow alternate filename for phase comparison if provided via env
const alt = process.env.LATEST_BENCHMARK_FILE;
const latestPath = path.join(
  perfDir,
  alt && alt.trim() ? alt.trim() : 'latest-benchmark.json'
);
const baselinePath = path.join(perfDir, 'baseline-core.json');

if (!fs.existsSync(latestPath)) {
  console.error('Latest benchmark not found. Run run-benchmark.mjs first.');
  process.exit(1);
}

const latest = loadJSON(latestPath);
const baselineSize = loadJSON(baselinePath); // { rawBytes, gzipBytes }

const failures = [];

// Compare if baseline has a legacy simple shape or new schema
const latestCases = latest.cases || [];

if (latestCases.length === 0) {
  console.warn('No benchmark cases in latest results.');
}

// Optional size regression check if env provides CURRENT_GZIP_BYTES
const currentGzip = process.env.CURRENT_GZIP_BYTES
  ? parseInt(process.env.CURRENT_GZIP_BYTES, 10)
  : undefined;
if (currentGzip && baselineSize.gzipBytes) {
  const pct =
    ((currentGzip - baselineSize.gzipBytes) / baselineSize.gzipBytes) * 100;
  if (pct > 2) {
    failures.push(`Gzip size increased ${pct.toFixed(2)}% (>2%)`);
  }
}

// Very coarse perf slowdown heuristic: compare aggregate totalMs vs previous snapshot if provided
const previousFile = process.env.PREV_BENCH_FILE;
if (previousFile) {
  const prev = loadJSON(path.join(perfDir, previousFile));
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

// Placeholder: we could fail if schema version mismatch
if (latest.schemaVersion && latest.schemaVersion !== 1) {
  failures.push(
    'Unsupported benchmark schema version: ' + latest.schemaVersion
  );
}

// Report summary
if (failures.length) {
  console.error('❌ Benchmark regressions detected:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
} else {
  console.log('✅ No benchmark threshold failures');
}
