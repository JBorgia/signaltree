#!/usr/bin/env node
/**
 * The cost of modelling a collection as a plain array leaf instead of an
 * `entityMap` — the measurement behind ST2018.
 *
 * WHY THIS EXISTS. Two published surfaces carried this comparison as a table
 * of three absolutes (`docs/guides/entity-collection-cookbook.md`, and the
 * "collection result depends entirely on using entityMap" paragraph in
 * `docs/compare/ngrx-signalstore.md`), and NO tool in this repo produced them.
 * They were measured once, by hand, and typed in. That is the same shape as the
 * three ungeneratable claims described in `tools/check-numeric-claims.mjs` —
 * a figure nothing can re-derive cannot be caught drifting, and ST2018 is a
 * diagnostic core emits at construction, so the number justifying it should not
 * be folklore.
 *
 * WHAT IT MEASURES. N single-row updates over a collection of N rows, three
 * ways:
 *
 *   entityMap        `updateOne(id, changes)` — one signal per entity, O(1)
 *   plain array leaf `update(rows => …slice()…)` — rebuilds the array
 *   SignalStore      `patchState(updateEntity(…))` — its own best idiom
 *
 * The array arm is deliberately written the way an application would write it:
 * copy, replace one element, return. That copy is the cost being measured, so
 * `slice()` is timed separately to show how much of the total it is.
 *
 * Arms are INTERLEAVED and the fixture is rebuilt every round, for the reasons
 * in `bench-vs-signalstore.mjs`: measuring one arm to completion and then the
 * next puts the later arm in a different JIT state, which has already produced
 * a phantom gap in this repo more than once.
 *
 *   node tools/bench-array-leaf.mjs
 *   node tools/bench-array-leaf.mjs --json
 *   node tools/bench-array-leaf.mjs --n 5000
 *   node tools/bench-array-leaf.mjs --n 50000 --updates 1000
 */
import { signalTree, entityMap } from '../dist/packages/core/dist/index.js';
import { signalState, patchState } from '@ngrx/signals';
import { setAllEntities, updateEntity } from '@ngrx/signals/entities';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const nArg = argv.indexOf('--n');
const N = nArg >= 0 ? Number(argv[nArg + 1]) : 1_000;
// Updates default to one per row; --updates measures a fixed count over a
// larger collection, which is a different shape and a different answer.
const uArg = argv.indexOf('--updates');
const U = uArg >= 0 ? Number(argv[uArg + 1]) : N;

const ROUNDS = 9;
const WARMUP = 2;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const spread = (xs) => Math.max(...xs) - Math.min(...xs);

let sink = 0;
const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i, v: 0, name: `row ${i}` }));

/** entityMap: one signal per entity, so a write touches exactly one. */
const armEntityMap = () => {
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
  t.$.rows.setAll(rows(N));
  const s = process.hrtime.bigint();
  for (let i = 0; i < U; i++) t.$.rows.updateOne(i % N, { v: i });
  const us = Number(process.hrtime.bigint() - s) / 1000;
  sink += t.$.rows.count();
  return us;
};

/** Plain array leaf: every update rebuilds the array. */
const armArrayLeaf = () => {
  const t = signalTree({ rows: rows(N) });
  const s = process.hrtime.bigint();
  for (let i = 0; i < U; i++) {
    const k = i % N;
    t.$.rows.update((cur) => {
      const next = cur.slice();
      next[k] = { ...next[k], v: i };
      return next;
    });
  }
  const us = Number(process.hrtime.bigint() - s) / 1000;
  sink += t.$.rows().length;
  return us;
};

/** SignalStore, using @ngrx/signals/entities — its own best idiom. */
const armSignalStore = () => {
  const st = signalState({ entityMap: {}, ids: [] });
  patchState(st, setAllEntities(rows(N)));
  const s = process.hrtime.bigint();
  for (let i = 0; i < U; i++)
    patchState(st, updateEntity({ id: i % N, changes: { v: i } }));
  const us = Number(process.hrtime.bigint() - s) / 1000;
  sink += st.ids().length;
  return us;
};

/** How much of the array arm is the copy alone, with no store involved. */
const armSliceOnly = () => {
  let cur = rows(N);
  const s = process.hrtime.bigint();
  for (let i = 0; i < U; i++) {
    const k = i % N;
    const next = cur.slice();
    next[k] = { ...next[k], v: i };
    cur = next;
  }
  const us = Number(process.hrtime.bigint() - s) / 1000;
  sink += cur.length;
  return us;
};

const ARMS = [
  ['entityMap', armEntityMap],
  ['plain array leaf', armArrayLeaf],
  ['SignalStore patchState', armSignalStore],
  ['(slice + spread alone)', armSliceOnly],
];

// Rotate which arm goes first each round.
const samples = new Map(ARMS.map(([k]) => [k, []]));
for (let r = 0; r < WARMUP + ROUNDS; r++) {
  const order = ARMS.map((_, i) => ARMS[(i + r) % ARMS.length]);
  for (const [label, fn] of order) {
    const us = fn();
    if (r >= WARMUP) samples.get(label).push(us);
  }
}

const result = ARMS.map(([label]) => {
  const xs = samples.get(label);
  return { label, medianMs: median(xs) / 1000, spreadMs: spread(xs) / 1000 };
});

if (asJson) {
  console.log(JSON.stringify({ n: N, updates: U, rounds: ROUNDS, arms: result }, null, 2));
} else {
  const base = result.find((r) => r.label === 'entityMap').medianMs;
  console.log(
    `\n${U} single-row updates over a ${N}-row collection — interleaved, median of ${ROUNDS}\n`
  );
  console.log(
    `  ${'arm'.padEnd(26)}${'median'.padStart(11)}${'spread'.padStart(11)}${'vs entityMap'.padStart(15)}`
  );
  for (const r of result) {
    const rel =
      r.label === 'entityMap'
        ? '—'
        : `${(r.medianMs / base).toFixed(1)}x slower`;
    console.log(
      `  ${r.label.padEnd(26)}${(r.medianMs.toFixed(2) + ' ms').padStart(11)}${('±' + r.spreadMs.toFixed(2)).padStart(11)}${rel.padStart(15)}`
    );
  }
  const leaf = result.find((r) => r.label === 'plain array leaf').medianMs;
  const store = result.find(
    (r) => r.label === 'SignalStore patchState'
  ).medianMs;
  const ratio = store / leaf;
  const near = ratio > 0.6 && ratio < 1.7;

  console.log(
    `\n  Both the array leaf and the immutable store rebuild the collection on\n` +
      `  every write, so both are quadratic in N. entityMap is not — one signal\n` +
      `  per entity, so the write is O(1) and byId(id) has a fan-out of 1.\n`
  );
  console.log(
    near
      ? `  At this N the two rebuilding arms are within ~${ratio.toFixed(1)}x of each other.\n`
      : `  They are NOT at parity here: SignalStore is ${ratio.toFixed(1)}x the array leaf.\n` +
          `  \`updateEntity\` spreads an N-key object per write, which costs more than\n` +
          `  \`slice()\` on a dense array. Do not describe these two as equivalent\n` +
          `  without re-running this at the N you intend to quote.\n`
  );
  console.log(
    `  Quote the absolutes and the N. The multiplier is a function of collection\n` +
      `  size — it grows with N, so any single value describes this fixture, not\n` +
      `  the library. That is the mistake ST2018's own docs were corrected for.\n`
  );
}

if (sink === Number.MIN_SAFE_INTEGER) console.log('');
