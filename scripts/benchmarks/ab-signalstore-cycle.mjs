/**
 * Positioning against the ACTUAL competitor: @ngrx/signals (SignalStore) 21.1.1.
 *
 * Both are signal-based and fine-grained, so this is apples-to-apples in a way
 * the classic-@ngrx/store comparison is not: identical operation, identical
 * reactive substrate (Angular signals), same read path.
 *
 * Operation: update ONE deeply nested field, then read it back through N
 * subscribers — what an application actually does per interaction.
 *
 * Semantics note: `patchState` is a SHALLOW patch at the root, so updating
 * `a.b.c.v0` requires rebuilding the object down the path (the spread below).
 * SignalTree deep-merges, so it expresses the same intent with just the path.
 * That difference IS the comparison, not a thumb on the scale.
 */
import { computed } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';
import { signalTree as baseTree } from './dist-base/dist/index.js';
import { signalTree as spikeTree } from './dist-spike/dist/index.js';

const SAMPLES = 11;
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
const shape = () => ({ a: { b: { c: { v0: 0, v1: 1, v2: 2 }, other: 1 }, sib: 2 }, top: 3 });

function build(subs) {
  const arms = [];
  {
    const store = signalState(shape());
    let n = 0;
    const cs = Array.from({ length: subs }, (_, i) => computed(() => store.a.b.c.v0() * (i + 1)));
    arms.push(['@ngrx/signals signalState', () => {
      const s = store();
      patchState(store, { a: { ...s.a, b: { ...s.a.b, c: { ...s.a.b.c, v0: n++ } } } });
      for (const c of cs) c();
    }]);
  }
  for (const [label, st] of [['SignalTree (base)', baseTree], ['SignalTree (indexed)', spikeTree]]) {
    const t = st(shape());
    let n = 0;
    const leaf = t.$.a.b.c.v0;
    const cs = Array.from({ length: subs }, (_, i) => computed(() => leaf() * (i + 1)));
    arms.push([label, () => {
      t({ a: { b: { c: { v0: n++ } } } });
      for (const c of cs) c();
    }]);
  }
  return arms;
}

for (const subs of [1, 10, 100]) {
  const arms = build(subs);
  const iters = subs >= 100 ? 5000 : 20000;
  for (let i = 0; i < iters; i++) for (const [, f] of arms) f();
  const res = arms.map(() => []);
  for (let s = 0; s < SAMPLES; s++)
    for (let k = 0; k < arms.length; k++) {
      const i = (k + s) % arms.length;
      res[i].push(sample(arms[i][1], iters));
    }
  const st = res.map(stats);
  console.log(`\nwrite + read through ${subs} subscriber(s)  (us/op, median of ${SAMPLES})`);
  arms.forEach(([label], i) =>
    console.log(`  ${label.padEnd(26)} ${st[i].med.toFixed(3)}us (iqr ${st[i].iqr.toFixed(3)})` +
      (i ? `  ${(st[0].med / st[i].med).toFixed(2)}x vs SignalStore` : '  [reference]')));
  console.log(`  indexed vs base SignalTree: ${(((st[2].med - st[1].med) / st[1].med) * 100).toFixed(1)}%`);
}
