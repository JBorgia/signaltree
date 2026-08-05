/**
 * A/B harness — baseline vs indexed-node-store.
 *
 * Both builds are imported into ONE process and their samples INTERLEAVED, so
 * process-level noise (JIT warmup, GC timing, CPU frequency, other load) hits
 * both arms equally instead of being confounded with the arm itself. The
 * previous attempt ran each arm in its own process and the variance swamped the
 * effect.
 *
 * Reports median and IQR over N samples. Median because one GC pause should not
 * move the answer; IQR because a difference smaller than the spread is not a
 * difference.
 *
 * Metrics are split by how the cost is PAID:
 *   ONE-TIME   — construct, memory-at-rest (paid once per tree)
 *   RECURRING  — read, walk, write, unwrap (paid forever)
 * A regression in the second class matters far more than one in the first.
 */
import { signalTree as baseTree } from './dist-base/dist/index.js';
import { signalTree as spikeTree } from './dist-spike/dist/index.js';

const SAMPLES = 15;

function deepState(depth, breadth) {
  if (depth === 0) {
    const leaf = {};
    for (let i = 0; i < breadth; i++) leaf[`v${i}`] = i;
    return leaf;
  }
  const node = {};
  for (let i = 0; i < breadth; i++) node[`n${i}`] = deepState(depth - 1, breadth);
  return node;
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { med: q(0.5), iqr: q(0.75) - q(0.25), min: s[0], max: s[s.length - 1] };
};

/** One timed sample: `iters` operations, returns µs/op. */
function sample(fn, iters) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return ((performance.now() - t0) / iters) * 1000;
}

/** Interleaved A/B. Returns {a, b, deltaPct}. */
function ab(name, kind, makeFn, iters, warmIters = iters) {
  const fa = makeFn(baseTree);
  const fb = makeFn(spikeTree);
  for (let i = 0; i < warmIters; i++) { fa(); fb(); }
  const A = [], B = [];
  for (let s = 0; s < SAMPLES; s++) {
    // Alternate which arm goes first so ordering cannot favour either.
    if (s % 2 === 0) { A.push(sample(fa, iters)); B.push(sample(fb, iters)); }
    else { B.push(sample(fb, iters)); A.push(sample(fa, iters)); }
  }
  const a = stats(A), b = stats(B);
  const deltaPct = ((b.med - a.med) / a.med) * 100;
  // A difference is only meaningful if it exceeds the spread of both arms.
  const noise = Math.max(a.iqr, b.iqr) / a.med * 100;
  const verdict = Math.abs(deltaPct) <= noise ? 'WITHIN NOISE' : (deltaPct > 0 ? 'SLOWER' : 'FASTER');
  console.log(
    `${kind.padEnd(9)} ${name.padEnd(24)} base ${a.med.toFixed(3)} (iqr ${a.iqr.toFixed(3)})  ` +
    `spike ${b.med.toFixed(3)} (iqr ${b.iqr.toFixed(3)})  ` +
    `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%  ${verdict}`
  );
}

// ---------------------------------------------------------------- ONE-TIME
const wide = deepState(2, 12);            // ~1728 leaves
ab('construct 1.7k leaves', 'ONE-TIME', (st) => () => st(wide), 20);

// ---------------------------------------------------------------- RECURRING
const deep = deepState(15, 1);
ab('deep read (15 levels)', 'RECURRING', (st) => {
  const t = st(deep);
  let c = t.$;
  for (let i = 0; i < 15; i++) c = c['n0'];
  const leaf = c['v0'];
  return () => leaf();
}, 200000);

ab('deep walk+read (15)', 'RECURRING', (st) => {
  const t = st(deep);
  return () => { let c = t.$; for (let i = 0; i < 15; i++) c = c['n0']; c['v0'](); };
}, 100000);

ab('shallow read', 'RECURRING', (st) => {
  const t = st(deepState(0, 40));
  const leaf = t.$['v0'];
  return () => leaf();
}, 500000);

ab('write 1 of 40', 'RECURRING', (st) => {
  const t = st(deepState(0, 40));
  let n = 0;
  return () => t({ v0: n++ });
}, 100000);

ab('write 20 of 40', 'RECURRING', (st) => {
  const t = st(deepState(0, 40));
  const p = {}; for (let i = 0; i < 20; i++) p[`v${i}`] = 0;
  let n = 0;
  return () => { p['v0'] = n++; t(p); };
}, 50000);

ab('nested write (depth 3)', 'RECURRING', (st) => {
  const t = st(deepState(3, 4));
  let n = 0;
  return () => t({ n0: { n0: { n0: { v0: n++ } } } });
}, 50000);

ab('unwrap 512 leaves', 'RECURRING', (st) => {
  const t = st(deepState(2, 8));
  return () => t();
}, 2000);

// ---------------------------------------------------------------- MEMORY
// Retained heap per tree — a Map per node is a permanent cost, not a one-off.
function retained(st, n, shape) {
  if (global.gc) { global.gc(); global.gc(); }
  const before = process.memoryUsage().heapUsed;
  const keep = [];
  for (let i = 0; i < n; i++) keep.push(st(shape));
  if (global.gc) { global.gc(); global.gc(); }
  const after = process.memoryUsage().heapUsed;
  keep.length = n; // keep alive across the measurement
  return (after - before) / n;
}
const memShape = deepState(2, 8); // 512 leaves, 73 nodes
const mb = retained(baseTree, 60, memShape);
const ms = retained(spikeTree, 60, memShape);
console.log(
  `MEMORY    retained/tree (73 nodes)  base ${(mb / 1024).toFixed(1)}KB  ` +
  `spike ${(ms / 1024).toFixed(1)}KB  ${(((ms - mb) / mb) * 100).toFixed(1)}%  ` +
  `(+${((ms - mb) / 73).toFixed(0)} B/node)` +
  (global.gc ? '' : '  [NO --expose-gc: unreliable]')
);
