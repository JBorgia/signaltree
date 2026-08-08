#!/usr/bin/env node
/**
 * Operation latency by tree depth.
 *
 * `docs/overview.md` carried a "Performance targets (Sept 2025)" table with four
 * absolute figures — 0.041 / 0.061 / 0.092 / 0.104 ms at depths 5 / 10 / 15 /
 * 20 — and NOTHING in the repo produced them. They were the same class of claim
 * as the "Core publishable 25.64KB" rows deleted alongside: a number with no
 * generator, which cannot go stale loudly because nothing ever re-derives it.
 *
 * Deleting them was one option. They are re-measurable, though — unlike the KB
 * rows, "operation latency at depth N" has an unambiguous method — so this
 * exists instead, and the doc cites it.
 *
 * An operation is one write plus one read of the deepest leaf, which is the
 * round trip a component actually performs. Reported as the MEDIAN of repeated
 * batches: a mean lets one GC pause set the number.
 *
 *   node tools/bench-depth-latency.mjs
 *   node tools/bench-depth-latency.mjs --json
 */
import { signalTree } from '../dist/packages/core/dist/index.js';

const DEPTHS = [5, 10, 15, 20];
const BATCH = 2000;
const BATCHES = 9;

/** A chain `l1.l2.….lN.value`, plus a sibling per level so nodes are not trivial. */
function buildDeep(depth) {
  let node = { value: 0 };
  for (let d = depth; d >= 1; d--) node = { [`l${d}`]: node, sibling: d };
  return node;
}

function leafAt(tree, depth) {
  let node = tree.$;
  for (let d = 1; d <= depth; d++) node = node[`l${d}`];
  return node.value;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

let sink = 0;

function measure(depth) {
  const tree = signalTree(buildDeep(depth));
  const leaf = leafAt(tree, depth);

  // Warm up: let V8 settle on shapes before anything is recorded.
  for (let i = 0; i < BATCH; i++) {
    leaf.set(i);
    sink += leaf();
  }

  const perOp = [];
  for (let b = 0; b < BATCHES; b++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < BATCH; i++) {
      leaf.set(i + b * BATCH); // a NEW value every time — never a no-op write
      sink += leaf();
    }
    perOp.push(Number(process.hrtime.bigint() - t) / BATCH / 1e6); // ms
  }
  return median(perOp);
}

/**
 * The other plausible reading of "operation at depth N": a ROOT update that
 * walks the whole chain, i.e. `tree({ l1: { l2: { … value } } })`, which goes
 * through `recursiveUpdate` rather than writing one leaf signal directly.
 *
 * Both are measured because the claim being checked never said which it meant,
 * and they differ by orders of magnitude. An unspecified metric cannot be
 * verified OR falsified, which is most of what was wrong with it.
 */
function buildPatch(depth, value) {
  let node = { value };
  for (let d = depth; d >= 1; d--) node = { [`l${d}`]: node };
  return node;
}

function measureRootUpdate(depth) {
  const tree = signalTree(buildDeep(depth));
  const leaf = leafAt(tree, depth);
  for (let i = 0; i < BATCH; i++) {
    tree(buildPatch(depth, i));
    sink += leaf();
  }
  const perOp = [];
  for (let b = 0; b < BATCHES; b++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < BATCH; i++) {
      tree(buildPatch(depth, i + b * BATCH));
      sink += leaf();
    }
    perOp.push(Number(process.hrtime.bigint() - t) / BATCH / 1e6);
  }
  return median(perOp);
}

const results = DEPTHS.map((depth) => ({
  depth,
  ms: measure(depth),
  rootMs: measureRootUpdate(depth),
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results }, null, 2));
} else {
  console.log(
    `\nOperation latency by depth — one write + one read of the deepest leaf`
  );
  console.log(
    `median of ${BATCHES} batches x ${BATCH} ops, after a warm-up batch\n`
  );
  console.log(`  depth      leaf write+read      root update through depth`);
  for (const { depth, ms, rootMs } of results) {
    console.log(
      `  ${String(depth).padStart(5)}   ${ms.toFixed(5)} ms` +
        `            ${rootMs.toFixed(5)} ms`
    );
  }
  const rootRatio = results[results.length - 1].rootMs / results[0].rootMs;
  console.log(
    `\n  Root update, depth 20 vs depth 5: ${rootRatio.toFixed(
      1
    )}x for 4x the\n` +
      `  depth — linear in the path walked, which is the expected shape.\n` +
      `\n  The leaf column is AT TIMER RESOLUTION and is not a result: it does\n` +
      `  not order by depth (it often reads faster deeper), because a direct\n` +
      `  leaf write does not touch the path at all. Read it as "too small to\n` +
      `  measure this way", not as a figure to quote.\n` +
      `\n  Absolute values are hardware-specific. Quote the SHAPE.\n`
  );
}

if (sink === -1) console.log(sink);
