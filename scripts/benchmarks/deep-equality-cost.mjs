import { signalState, patchState } from '@ngrx/signals';
import { signalTree } from './dist-core/dist/index.js';

// FIXTURE CORRECTNESS — read before editing.
//
// An earlier version built items as `{id: i, value: i}` and then "updated"
// index `i % N` with `value: i`. For i < N that writes the value ALREADY THERE,
// so every update was a structurally identical no-op — which is the worst case
// for deepEqual (it walks all N elements instead of short-circuiting at the
// first difference) and measured 385ms where a real update measures 53-218ms.
// It made SignalTree look ~7x worse than it is.
//
// A per-pass counter that never repeats avoids both that and the replay variant
// of the same trap (fixtures are reused across samples, so `-(i+1)` degenerates
// into a no-op from the second pass onward).
let __writeSeq = 0;

const N = 50000, UPDATES = 200;
const mk = () => Array.from({ length: N }, (_, i) => ({ id: i, value: i }));
const time = (label, fn) => { for (let i=0;i<2;i++) fn(); const t0=performance.now(); fn(); return `${label}=${(performance.now()-t0).toFixed(1)}ms`; };
const out = [];

// Hypothesis: the cost is deepEqual running over 50k elements on every set().
const deep = signalTree({ items: mk() });
out.push(time('SignalTree deepEqual (default)', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    deep.$.items.update((a) => { const n = a.slice(); n[idx] = { ...n[idx], value: ++__writeSeq }; return n; });
  }
}));

const shallow = signalTree({ items: mk() }, { useShallowComparison: true });
out.push(time('SignalTree Object.is (shallow)', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    shallow.$.items.update((a) => { const n = a.slice(); n[idx] = { ...n[idx], value: ++__writeSeq }; return n; });
  }
}));

const st = signalState({ items: mk() });
out.push(time('SignalStore patchState        ', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    patchState(st, (s) => { const n = s.items.slice(); n[idx] = { ...n[idx], value: ++__writeSeq }; return { ...s, items: n }; });
  }
}));
console.log(out.join('\n'));
