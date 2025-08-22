#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

function parseArg(name, fallback) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  const env = process.env[name.toUpperCase()];
  if (env) return Number(env);
  return fallback;
}

function parseDepths() {
  const idx = process.argv.findIndex((a) => a === '--depths');
  if (idx >= 0 && process.argv[idx + 1])
    return process.argv[idx + 1].split(',').map(Number);
  return [5, 10, 15, 20];
}

function makeNested(depth, value = 42) {
  const obj = { v: value };
  let head = obj;
  for (let i = 1; i < depth; i++) {
    head.next = { v: value + i };
    head = head.next;
  }
  return obj;
}

function readAtDepth(root, depth) {
  let cur = root;
  for (let i = 0; i < depth && cur; i++) cur = cur.next;
  return cur ? cur.v : undefined;
}

function writeAtDepth(root, depth, val) {
  let cur = root;
  for (let i = 0; i < depth - 1 && cur; i++) cur = cur.next;
  if (cur && cur.next) cur.next.v = val;
  else if (cur) cur.v = val;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const ops = parseArg('ops', 10000);
  const warmup = parseArg('warmup', 1000);
  const repeats = parseArg('repeats', 10);
  const depths = parseDepths();

  console.log(
    `Benchmark config: ops=${ops}, warmup=${warmup}, repeats=${repeats}, depths=${depths.join(
      ','
    )}`
  );

  const results = {};
  const outDir = path.join(process.cwd(), 'scripts', 'performance', 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const depth of depths) {
    const tree = makeNested(depth);
    // warmup
    for (let i = 0; i < warmup; i++) {
      readAtDepth(tree, depth - 1);
      writeAtDepth(tree, depth, i);
    }

    const totalTimes = [];
    for (let r = 0; r < repeats; r++) {
      const t0 = performance.now();
      for (let i = 0; i < ops; i++) {
        if ((i & 1) === 0) readAtDepth(tree, depth - 1);
        else writeAtDepth(tree, depth, i);
      }
      const t1 = performance.now();
      totalTimes.push(t1 - t0);
      await sleep(10);
    }

    const sum = totalTimes.reduce((a, b) => a + b, 0);
    const avgMsPerOp = sum / (repeats * ops);
    results[`d${depth}`] = {
      depth,
      operations: ops,
      repeats,
      totalTimes,
      avgTime: avgMsPerOp,
    };
    console.log(`depth=${depth} -> avg ${avgMsPerOp.toFixed(6)} ms/op`);
  }

  const out = {
    timestamp: Date.now(),
    runner: 'runner-standard-js',
    config: { ops, warmup, repeats, depths },
    results,
  };
  const outPath = path.join(outDir, `recursive-performance-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote results to ${outPath}`);
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
