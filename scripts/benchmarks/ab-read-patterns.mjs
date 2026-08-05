/**
 * READ-ONLY workload. No writes at all.
 *
 * The distinction that matters and that I blurred: a read through a HELD leaf
 * reference (`const leaf = t.$.a.b.c; leaf()`) is not the same operation as a
 * read that WALKS the tree each time (`t.$.a.b.c()`). The second is what an
 * Angular template does on every change-detection pass, so it is the common
 * case, not an edge case.
 */
import { signalTree as baseTree } from './dist-base/dist/index.js';
import { signalTree as spikeTree } from './dist-spike/dist/index.js';

const SAMPLES = 21;
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { med: q(0.5), iqr: q(0.75) - q(0.25) };
};
const sample = (fn, n) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return ((performance.now() - t0) / n) * 1000;
};

function deepState(depth, breadth) {
  if (depth === 0) {
    const o = {};
    for (let i = 0; i < breadth; i++) o[`v${i}`] = i;
    return o;
  }
  const o = {};
  for (let i = 0; i < breadth; i++) o[`n${i}`] = deepState(depth - 1, breadth);
  return o;
}

function ab(name, makeFn, iters) {
  const arms = [['base', makeFn(baseTree)], ['indexed', makeFn(spikeTree)]];
  for (let i = 0; i < iters; i++) for (const [, f] of arms) f();
  const res = [[], []];
  for (let s = 0; s < SAMPLES; s++)
    for (let k = 0; k < 2; k++) {
      const i = (k + s) % 2;
      res[i].push(sample(arms[i][1], iters));
    }
  const [a, b] = res.map(stats);
  const d = ((b.med - a.med) / a.med) * 100;
  const noise = (Math.max(a.iqr, b.iqr) / a.med) * 100;
  console.log(
    `${name.padEnd(34)} base ${a.med.toFixed(4)}us  indexed ${b.med.toFixed(4)}us  ` +
    `${d >= 0 ? '+' : ''}${d.toFixed(1)}%  ${Math.abs(d) <= noise ? 'within noise' : d > 0 ? 'SLOWER' : 'FASTER'}`
  );
}

// Held reference — what I measured before and called "reads".
for (const depth of [1, 5, 15]) {
  ab(`held leaf ref, depth ${depth}`, (st) => {
    const t = st(deepState(depth, 2));
    let c = t.$;
    for (let i = 0; i < depth; i++) c = c['n0'];
    const leaf = c['v0'];
    return () => leaf();
  }, 300000);
}

// Walking read — what a template actually does.
for (const depth of [1, 3, 5, 10, 15]) {
  ab(`WALK + read, depth ${depth}`, (st) => {
    const t = st(deepState(depth, 2));
    return () => {
      let c = t.$;
      for (let i = 0; i < depth; i++) c = c['n0'];
      c['v0']();
    };
  }, 200000);
}

// Whole-subtree read (branch accessor call) — also a template pattern.
ab('branch read (unwrap subtree)', (st) => {
  const t = st(deepState(3, 3));
  return () => t.$['n0']();
}, 20000);
