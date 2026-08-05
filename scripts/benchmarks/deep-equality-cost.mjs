import { signalState, patchState } from '@ngrx/signals';
import { signalTree } from './dist-core/dist/index.js';

const N = 50000, UPDATES = 200;
const mk = () => Array.from({ length: N }, (_, i) => ({ id: i, value: i }));
const time = (label, fn) => { for (let i=0;i<2;i++) fn(); const t0=performance.now(); fn(); return `${label}=${(performance.now()-t0).toFixed(1)}ms`; };
const out = [];

// Hypothesis: the cost is deepEqual running over 50k elements on every set().
const deep = signalTree({ items: mk() });
out.push(time('SignalTree deepEqual (default)', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    deep.$.items.update((a) => { const n = a.slice(); n[idx] = { ...n[idx], value: i }; return n; });
  }
}));

const shallow = signalTree({ items: mk() }, { useShallowComparison: true });
out.push(time('SignalTree Object.is (shallow)', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    shallow.$.items.update((a) => { const n = a.slice(); n[idx] = { ...n[idx], value: i }; return n; });
  }
}));

const st = signalState({ items: mk() });
out.push(time('SignalStore patchState        ', () => {
  for (let i = 0; i < UPDATES; i++) {
    const idx = i % N;
    patchState(st, (s) => { const n = s.items.slice(); n[idx] = { ...n[idx], value: i }; return { ...s, items: n }; });
  }
}));
console.log(out.join('\n'));
