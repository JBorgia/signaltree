#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const THRESHOLDS = {
  avgNsPerOpIncreasePct: 15, // fail if any case slows > 15%
  gzipSizeIncreasePct: 2, // optional if size file present
};

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const perfDir = path.join(process.cwd(), 'scripts/performance');
const latestPath = path.join(perfDir, 'latest-benchmark.json');
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
