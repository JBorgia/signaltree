#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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
// Baseline currently only stores size; not yet integrated in numeric comparison
loadJSON(baselinePath);

const failures = [];

// Compare if baseline has a legacy simple shape or new schema
const latestCases = latest.cases || [];

if (latestCases.length === 0) {
  console.warn('No benchmark cases in latest results.');
}

// (Optional) if we extend baseline to hold perf numbers later.
// For now we only check bundle size growth from baseline-core.json
// Future: integrate size diff once new metrics include current size.

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
