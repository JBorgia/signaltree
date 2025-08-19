#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Simple baseline micro-benchmark: create tree, perform 1000 incremental updates, deep path update.
import { signalTree } from '../../dist/packages/core/fesm2022/signaltree-core.mjs';

function bench(label, fn) {
  const start = performance.now();
  fn();
  return { label, ms: performance.now() - start };
}

function createTree() {
  return signalTree({
    level1: { level2: { level3: { count: 0 } } },
    items: Array.from({ length: 50 }, (_, i) => ({ id: i, value: i })),
  });
}

const tree = createTree();

const results = [];

results.push(
  bench('1000 shallow increments', () => {
    for (let i = 0; i < 1000; i++) {
      tree.$.level1.level2.level3.count.set(i);
    }
  })
);

results.push(
  bench('Deep path write loop', () => {
    for (let i = 0; i < 300; i++) {
      tree.$.level1.level2.level3.count.update((v) => v + 1);
    }
  })
);

const out = { timestamp: new Date().toISOString(), results };
const dest = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'latest-benchmark.json'
);
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(out);
