#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUNS = parseInt(process.env.BENCH_RUNS || '5', 10); // includes warmup
const DISCARD = parseInt(process.env.BENCH_WARMUP || '1', 10);
const script = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'run-benchmark.mjs'
);
const perfDir = path.dirname(script);

const results = [];
for (let i = 0; i < RUNS; i++) {
  const res = spawnSync('node', [script], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('Benchmark run failed', res.stderr || res.stdout);
    process.exit(1);
  }
  try {
    const json = JSON.parse(res.stdout.trim());
    results.push(json);
  } catch (e) {
    console.error('Failed to parse benchmark output run', i, e);
    process.exit(1);
  }
}

const usable = results.slice(DISCARD); // drop warmups

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Build median summary
const caseNames = usable[0].cases.map((c) => c.name);
const medCases = caseNames.map((name) => {
  const caseRuns = usable.map((r) => r.cases.find((c) => c.name === name));
  const totalMsValues = caseRuns.map((c) => c.totalMs);
  const ops = caseRuns[0].ops;
  const medTotalMs = median(totalMsValues);
  return {
    name,
    ops,
    totalMs: medTotalMs,
    avgNsPerOp: (medTotalMs / ops) * 1e6,
  };
});

const sourceCaseRuns = usable.map((r) => ({
  timestamp: r.timestamp,
  cases: r.cases.map((c) => ({ name: c.name, totalMs: c.totalMs })),
}));

const summary = {
  schemaVersion: 1,
  timestamp: new Date().toISOString(),
  runs: RUNS,
  discarded: DISCARD,
  totals: {
    cases: medCases.length,
    totalMs: medCases.reduce((s, c) => s + c.totalMs, 0),
    totalOps: medCases.reduce((s, c) => s + c.ops, 0),
  },
  cases: medCases,
  sourceRuns: usable.map((r) => ({
    timestamp: r.timestamp,
    totalMs: r.totals.totalMs,
  })),
  sourceCaseRuns,
};

fs.writeFileSync(
  path.join(perfDir, 'latest-benchmark-median.json'),
  JSON.stringify(summary, null, 2)
);
console.log(JSON.stringify(summary, null, 2));
