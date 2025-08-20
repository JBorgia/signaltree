#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import { macroLatestPath, ensurePerformanceDirs } from './paths.mjs';

// Simple baseline micro-benchmark: create tree, perform 1000 incremental updates, deep path update.
import { signalTree } from '../../dist/packages/core/fesm2022/signaltree-core.mjs';

// Benchmark schema version
const SCHEMA_VERSION = 1;

function now() {
  return performance.now();
}

function benchOps(name, ops, fn) {
  const start = now();
  fn();
  const ms = now() - start;
  return {
    name,
    ops,
    totalMs: ms,
    avgNsPerOp: (ms / ops) * 1e6,
  };
}

function createTree(size = 50) {
  return signalTree({
    level1: { level2: { level3: { count: 0 } } },
    items: Array.from({ length: size }, (_, i) => ({ id: i, value: i })),
  });
}

// Collect benchmarks
const cases = [];

// 1. Creation cost
cases.push(
  benchOps('tree creation x100', 100, () => {
    for (let i = 0; i < 100; i++) createTree();
  })
);

// Prepare one tree for mutation benchmarks
const tree = createTree();

// 2. Shallow increments
cases.push(
  benchOps('shallow increments (set) x1000', 1000, () => {
    for (let i = 0; i < 1000; i++) tree.$.level1.level2.level3.count.set(i);
  })
);

// 3. Deep path update using update()
cases.push(
  benchOps('deep path update (update) x300', 300, () => {
    for (let i = 0; i < 300; i++)
      tree.$.level1.level2.level3.count.update((v) => v + 1);
  })
);

// 4. Fan-out with subscribers (10 subscribers) shallow writes
const fanTree = createTree();
let fanAccumulator = 0;
for (let i = 0; i < 10; i++) {
  fanTree.subscribe((state) => {
    fanAccumulator += state.level1.level2.level3.count;
  });
}
cases.push(
  benchOps('shallow set fan-out x500 (10 subs)', 500, () => {
    for (let i = 0; i < 500; i++) fanTree.$.level1.level2.level3.count.set(i);
  })
);

// 5. Deep update with subscribers
cases.push(
  benchOps('deep update fan-out x300 (10 subs)', 300, () => {
    for (let i = 0; i < 300; i++)
      fanTree.$.level1.level2.level3.count.update((v) => v + 1);
  })
);

// 6. Bulk reads (non-mutating)
cases.push(
  benchOps('bulk reads x5000', 5000, () => {
    for (let i = 0; i < 5000; i++) {
      void fanTree.$.level1.level2.level3.count();
    }
  })
);

// Summaries
// Consume accumulator to prevent tree-shaking / lint complaint
if (fanAccumulator === Number.MIN_VALUE) {
  console.log('impossible sentinel', fanAccumulator);
}

const summary = {
  schemaVersion: SCHEMA_VERSION,
  timestamp: new Date().toISOString(),
  totals: {
    cases: cases.length,
    totalMs: cases.reduce((s, c) => s + c.totalMs, 0),
    totalOps: cases.reduce((s, c) => s + c.ops, 0),
  },
  cases,
};

ensurePerformanceDirs();
const outFile = macroLatestPath();
fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
