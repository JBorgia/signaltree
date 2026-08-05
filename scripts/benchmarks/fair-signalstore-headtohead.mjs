/**
 * Fair head-to-head: SignalTree vs @ngrx/signals SignalStore.
 *
 * Written because the demo's arms are asymmetric in BOTH directions:
 *
 *  - SignalTree's `deep-nested` and `large-array` start the clock BEFORE
 *    constructing the store (a 50k-element allocation for large-array), while
 *    the SignalStore arm starts it after. That penalises us.
 *  - The SignalStore `large-array` arm rebuilds with `items.map(cb)` — 50k
 *    callback invocations — where our arm uses `items.slice()`, a memcpy. Both
 *    are equally idiomatic; using the slower one on their side flatters us.
 *
 * Here: identical construction OUTSIDE the timed region, identical work inside,
 * and each library uses the cheapest idiomatic form of the SAME operation.
 * Where the two genuinely differ (one leaf write vs an immutable rebuild) that
 * IS the architecture and is left alone — that is the thing being measured.
 *
 * Interleaved, arm order rotated per sample, medians + IQR.
 */
import { computed } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';
import { signalTree } from './dist-core/dist/index.js';

const SAMPLES = 11;
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { med: q(0.5), iqr: q(0.75) - q(0.25) };
};

/** Runs both arms interleaved; each arm is (setup) => timedFn. */
function race(name, note, armA, armB, reps) {
  const arms = [['SignalTree', armA()], ['SignalStore', armB()]];
  for (let i = 0; i < 3; i++) for (const [, f] of arms) f(); // warm
  const res = [[], []];
  for (let s = 0; s < SAMPLES; s++)
    for (let k = 0; k < 2; k++) {
      const i = (k + s) % 2;
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) arms[i][1]();
      res[i].push((performance.now() - t0) / reps);
    }
  const [a, b] = res.map(stats);
  const ratio = b.med / a.med;
  console.log(
    `${name.padEnd(22)} ST ${a.med.toFixed(3)}ms  SS ${b.med.toFixed(3)}ms  ` +
    `${ratio >= 1 ? ratio.toFixed(1) + 'x FASTER' : (1 / ratio).toFixed(2) + 'x slower'}   ${note}`
  );
}

const DEPTH = 15;
const UPDATES = 1000;
const nested = (l) => (l === 0 ? { value: 0, data: 'test' } : { level: nested(l - 1) });

// ---- deep nested: 1000 updates to a 15-level leaf -------------------------
// NOTE: the path is WALKED inside the loop, deliberately. An earlier version of
// this file hoisted the 15-level walk out and reused the leaf reference, so
// SignalTree was timed doing 1000 setter calls while SignalStore did 1000 full
// rebuilds. That inflated the result from 20.2x to 31.2x. Real code — and the
// demo's own arm — resolves the path each time.
race('deep-nested', '1 leaf write vs 15-object rebuild',
  () => {
    const t = signalTree(nested(DEPTH));
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        let cur = t.$;
        for (let j = 0; j < DEPTH; j++) cur = cur.level;
        cur.value.set(i);
      }
    };
  },
  () => {
    const st = signalState(nested(DEPTH));
    return () => {
      for (let i = 0; i < UPDATES; i++)
        patchState(st, (s) => {
          const up = (o, l) => (l === 0 ? { ...o, value: i } : { ...o, level: up(o.level ?? {}, l - 1) });
          return up(s, DEPTH - 1);
        });
    };
  }, 1);

// ---- large array: 1000 single-element updates over 50k --------------------
const N = 50000;
const mkItems = () => Array.from({ length: N }, (_, i) => ({ id: i, value: i }));
race('large-array', 'both slice(); SS also rebuilds root',
  () => {
    const t = signalTree({ items: mkItems() });
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        const idx = i % N;
        t.$.items.update((items) => {
          const next = items.slice();
          next[idx] = { ...next[idx], value: i };
          return next;
        });
      }
    };
  },
  () => {
    const st = signalState({ items: mkItems() });
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        const idx = i % N;
        // Cheapest idiomatic form — slice, not map. The demo used map(cb),
        // which is 50k callback invocations per update and flattered us.
        patchState(st, (s) => {
          const next = s.items.slice();
          next[idx] = { ...next[idx], value: i };
          return { ...s, items: next };
        });
      }
    };
  }, 1);

// ---- computed chains: recompute a derived value after each write ----------
race('computed-chains', 'same computed body both sides',
  () => {
    const t = signalTree({ value: 0, factors: Array.from({ length: 20 }, (_, i) => i + 1) });
    const c = computed(() => {
      const v = t.$.value();
      let acc = 0;
      for (const f of t.$.factors()) acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });
    c();
    return () => { for (let i = 0; i < 500; i++) { t.$.value.set(i); c(); } };
  },
  () => {
    const st = signalState({ value: 0, factors: Array.from({ length: 20 }, (_, i) => i + 1) });
    const c = computed(() => {
      const v = st.value();
      let acc = 0;
      for (const f of st.factors()) acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });
    c();
    return () => { for (let i = 0; i < 500; i++) { patchState(st, { value: i }); c(); } };
  }, 1);

// ---- batch updates: N fields in one logical transaction -------------------
race('batch-updates', '9 fields x 100 batches',
  () => {
    const shape = {}; for (let i = 0; i < 9; i++) shape[`f${i}`] = 0;
    const t = signalTree({ ...shape });
    return () => {
      for (let b = 0; b < 100; b++) {
        const p = {}; for (let i = 0; i < 9; i++) p[`f${i}`] = b;
        t(p);
      }
    };
  },
  () => {
    const shape = {}; for (let i = 0; i < 9; i++) shape[`f${i}`] = 0;
    const st = signalState({ ...shape });
    return () => {
      for (let b = 0; b < 100; b++) {
        const p = {}; for (let i = 0; i < 9; i++) p[`f${i}`] = b;
        patchState(st, p);
      }
    };
  }, 1);

// ---- selector memoization: many reads, few writes -------------------------
race('selector-memo', '1000 reads per write',
  () => {
    const t = signalTree({ n: 0, items: Array.from({ length: 100 }, (_, i) => i) });
    const sel = computed(() => t.$.items().reduce((a, b) => a + b, 0) + t.$.n());
    sel();
    return () => { for (let w = 0; w < 10; w++) { t.$.n.set(w); for (let r = 0; r < 100; r++) sel(); } };
  },
  () => {
    const st = signalState({ n: 0, items: Array.from({ length: 100 }, (_, i) => i) });
    const sel = computed(() => st.items().reduce((a, b) => a + b, 0) + st.n());
    sel();
    return () => { for (let w = 0; w < 10; w++) { patchState(st, { n: w }); for (let r = 0; r < 100; r++) sel(); } };
  }, 1);

// ---- concurrent updates: interleaved writers ------------------------------
race('concurrent-updates', '50 counters x 200 rounds',
  () => {
    const t = signalTree({ counters: Array.from({ length: 50 }, () => ({ value: 0 })) });
    return () => {
      for (let u = 0; u < 200; u++)
        for (let w = 0; w < 50; w++)
          t.$.counters.update((arr) => arr.map((c, i) => (i === w ? { value: c.value + 1 } : c)));
    };
  },
  () => {
    const st = signalState({ counters: Array.from({ length: 50 }, () => ({ value: 0 })) });
    return () => {
      for (let u = 0; u < 200; u++)
        for (let w = 0; w < 50; w++)
          patchState(st, (s) => ({ ...s, counters: s.counters.map((c, i) => (i === w ? { value: c.value + 1 } : c)) }));
    };
  }, 1);
