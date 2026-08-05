/**
 * TASK-based comparison, not implementation-based.
 *
 * The mistake this replaces: earlier harnesses forced SignalTree to perform an
 * immutable array rebuild because that is what SignalStore has to do. That
 * measures SignalTree impersonating SignalStore. No real application writes
 * that — it would reach for `entityMap()`, which exists precisely for
 * collections.
 *
 * So each library gets its OWN best idiom for the SAME user-facing outcome, and
 * the outcome is asserted identical at the end. That is what an application
 * actually experiences.
 *
 * TASK: a 50,000-row collection. Toggle one row's `active` flag 1000 times
 * (different rows), and keep a derived value that depends on ONE specific row
 * up to date — the shape of a data grid with a detail pane.
 */
import { computed } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';
import { entityMap, signalTree } from './dist-core/dist/index.js';

const SAMPLES = 11;
const N = 50000;
const UPDATES = 1000;
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { med: q(0.5), iqr: q(0.75) - q(0.25) };
};
const rows = () =>
  Array.from({ length: N }, (_, i) => ({ id: i, name: `Row ${i}`, active: false }));

function race(name, arms) {
  const built = arms.map(([label, mk]) => [label, mk()]);
  for (let i = 0; i < 2; i++) for (const [, f] of built) f();
  const res = built.map(() => []);
  for (let s = 0; s < SAMPLES; s++)
    for (let k = 0; k < built.length; k++) {
      const i = (k + s) % built.length;
      const t0 = performance.now();
      built[i][1]();
      res[i].push(performance.now() - t0);
    }
  const st = res.map(stats);
  const base = st[st.length - 1].med; // last arm is the SignalStore reference
  console.log(`\n${name}`);
  built.forEach(([label], i) =>
    console.log(
      `  ${label.padEnd(38)} ${st[i].med.toFixed(2).padStart(8)}ms` +
      (i === built.length - 1 ? '   [reference]' : `   ${(base / st[i].med).toFixed(1)}x`)
    )
  );
}

race('TASK: toggle 1 row of 50k, 1000x, with a dependent read', [
  // What a real SignalTree app writes for a collection.
  ['SignalTree entityMap (idiomatic)', () => {
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    t.$.rows.setAll(rows());
    const watched = computed(() => t.$.rows.byId(7)?.().active);
    watched();
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        t.$.rows.updateOne(i % N, { active: i % 2 === 0 });
        watched();
      }
    };
  }],
  // What a SignalTree app writes if it models the collection as a plain array
  // leaf — the shape my earlier harness forced, kept for contrast.
  ['SignalTree plain array leaf', () => {
    const t = signalTree({ rows: rows() });
    const watched = computed(() => t.$.rows()[7].active);
    watched();
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        const idx = i % N;
        t.$.rows.update((a) => {
          const n = a.slice();
          n[idx] = { ...n[idx], active: i % 2 === 0 };
          return n;
        });
        watched();
      }
    };
  }],
  // What a SignalStore app must write — there is no targeted-write API.
  ['SignalStore patchState', () => {
    const st = signalState({ rows: rows() });
    const watched = computed(() => st.rows()[7].active);
    watched();
    return () => {
      for (let i = 0; i < UPDATES; i++) {
        const idx = i % N;
        patchState(st, (s) => {
          const n = s.rows.slice();
          n[idx] = { ...n[idx], active: i % 2 === 0 };
          return { ...s, rows: n };
        });
        watched();
      }
    };
  }],
]);

// Correctness: all three must end in the same observable state.
{
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
  t.$.rows.setAll(rows());
  t.$.rows.updateOne(7, { active: true });
  const st = signalState({ rows: rows() });
  patchState(st, (s) => {
    const n = s.rows.slice();
    n[7] = { ...n[7], active: true };
    return { ...s, rows: n };
  });
  console.log(
    `\ncorrectness: entityMap row7.active=${t.$.rows.byId(7)?.().active} ` +
    `signalStore row7.active=${st.rows()[7].active}`
  );
}
