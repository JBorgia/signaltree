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
 * (rows 0..999), and keep a derived value that depends on ONE specific row up
 * to date — the shape of a data grid with a detail pane.
 *
 * Run:  node task-collection-update.mjs           (all arms, isolated)
 *       node task-collection-update.mjs "<arm>"   (one arm; used internally)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EACH ARM RUNS IN ITS OWN PROCESS — read before "simplifying" this back
 * into a single process.
 *
 * This harness used to interleave the arms in one process, which is the usual
 * advice (it cancels drift and thermal effects). For THIS workload it is wrong,
 * and it was wrong by 7.5x.
 *
 * Measured: the SignalTree array-leaf arm costs ~50ms alone, ~50ms with any ONE
 * other arm present, and ~375ms as soon as a THIRD arm of a DIFFERENT KIND is
 * in the race — while the plain-JS and SignalStore arms are unmoved. Three
 * IDENTICAL SignalTree arms are all fast (55/54/54ms), so it is not arm count,
 * and it is not memory: an 8GB old-space and a 64MB semi-space change nothing.
 * It is V8 losing a shared call site to megamorphism once heterogeneous
 * closures flow through it, and the cost lands entirely on the arm whose hot
 * loop lives inside a shared generic function.
 *
 * The effect is large enough to invert conclusions, and it moves when you ADD
 * AN UNRELATED ARM — so an in-process race silently reports a different result
 * for the same library depending on who else is being benchmarked that day. One
 * process per arm is the only measurement that matches what an application
 * runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIXTURE CORRECTNESS — also read before editing.
 *
 * An earlier version built items as `{id: i, value: i}` and then "updated"
 * index `i % N` with `value: i`, writing the value ALREADY THERE. Every update
 * was a structurally identical no-op, which is deepEqual's WORST case: it walks
 * all N elements instead of short-circuiting at the first difference.
 *
 * A shared pass counter was tried as the fix and was WORSE, because it made the
 * result depend on the NUMBER OF ARMS — each arm takes one counter value per
 * pass, so the stride is the arm count, and an even stride leaves the parity
 * constant across passes: straight back to a no-op.
 *
 * The fix is to derive the write from the value already there, the way an
 * application writes a toggle. It cannot degenerate and needs no counter.
 *
 * It matters a great deal WHERE in the array the change lands, because
 * deepEqual is O(index of first difference). Same 1000 updates to a 50k array
 * leaf:
 *     index 0        89ms        moving index (avg 500)    92ms
 *     last index    487ms        no change at all         506ms
 * So the target index is part of the workload definition. This one walks rows
 * 0..999 — the head — stated here so the number is not read as typical.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { computed } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';

import { entityMap, signalTree } from './dist-core/dist/index.js';

const SAMPLES = 11;
const REPS = 5; // whole-process repetitions, to expose cross-process variance
const N = 50000;
const UPDATES = 1000;

const rows = () =>
  Array.from({ length: N }, (_, i) => ({
    id: i,
    name: `Row ${i}`,
    active: false,
  }));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const ARMS = {
  // What a real SignalTree app writes for a collection.
  'SignalTree entityMap': () => {
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    t.$.rows.setAll(rows());
    const watched = computed(() => t.$.rows.byId(7)?.().active);
    watched();
    return {
      run: () => {
        for (let i = 0; i < UPDATES; i++) {
          const id = i % N;
          t.$.rows.updateOne(id, { active: !t.$.rows.byId(id)?.().active });
          watched();
        }
      },
      read: () => t.$.rows.byId(7)?.().active,
    };
  },
  // What a SignalTree app writes if it models the collection as a plain array
  // leaf — the shape the earlier harness forced. Kept for contrast: this is the
  // idiom to AVOID, not a SignalTree headline result.
  'SignalTree array leaf': () => {
    const t = signalTree({ rows: rows() });
    const watched = computed(() => t.$.rows()[7].active);
    watched();
    return {
      run: () => {
        for (let i = 0; i < UPDATES; i++) {
          const idx = i % N;
          t.$.rows.update((a) => {
            const n = a.slice();
            n[idx] = { ...n[idx], active: !n[idx].active };
            return n;
          });
          watched();
        }
      },
      read: () => t.$.rows()[7].active,
    };
  },
  // What a SignalStore app must write — there is no targeted-write API.
  'SignalStore patchState': () => {
    const st = signalState({ rows: rows() });
    const watched = computed(() => st.rows()[7].active);
    watched();
    return {
      run: () => {
        for (let i = 0; i < UPDATES; i++) {
          const idx = i % N;
          patchState(st, (s) => {
            const n = s.rows.slice();
            n[idx] = { ...n[idx], active: !n[idx].active };
            return { ...s, rows: n };
          });
          watched();
        }
      },
      read: () => st.rows()[7].active,
    };
  },
};

const requested = process.argv[2];

if (requested) {
  // Child: one arm, one process, nothing else loaded into the inline caches.
  const { run, read } = ARMS[requested]();
  run();
  run();
  const samples = [];
  for (let s = 0; s < SAMPLES; s++) {
    const t0 = performance.now();
    run();
    samples.push(performance.now() - t0);
  }
  process.stdout.write(JSON.stringify({ med: median(samples), read: read() }));
} else {
  const self = fileURLToPath(import.meta.url);
  const names = Object.keys(ARMS);
  const out = new Map(names.map((n) => [n, []]));
  const reads = new Map();

  for (let r = 0; r < REPS; r++) {
    for (const name of names) {
      const res = spawnSync(process.execPath, [self, name], {
        encoding: 'utf8',
      });
      if (res.status !== 0) throw new Error(`${name} failed:\n${res.stderr}`);
      const { med, read } = JSON.parse(res.stdout);
      out.get(name).push(med);
      reads.set(name, read);
    }
  }

  console.log(
    `\nTASK: toggle 1 row of ${N.toLocaleString()}, ${UPDATES}x, with a dependent read`
  );
  console.log(
    `(one process per arm, ${REPS} processes x ${SAMPLES} samples, medians)\n`
  );
  const meds = new Map([...out].map(([n, v]) => [n, median(v)]));
  const base = meds.get('SignalStore patchState');
  for (const [name, v] of out) {
    const m = meds.get(name);
    const spread = `${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}`;
    const rel =
      name === 'SignalStore patchState'
        ? '[reference]'
        : `${(base / m).toFixed(1)}x`;
    console.log(
      `  ${name.padEnd(24)} ${m.toFixed(2).padStart(8)}ms  (${spread.padStart(
        13
      )})  ${rel}`
    );
  }

  // Correctness: every arm must end in the same observable state.
  const distinct = new Set([...reads.values()]);
  console.log(
    `\ncorrectness: ${[...reads].map(([n, v]) => `${n}=${v}`).join(', ')}` +
      (distinct.size === 1 ? '  OK' : '  MISMATCH')
  );
  if (distinct.size !== 1) process.exitCode = 1;
}
