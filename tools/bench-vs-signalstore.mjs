#!/usr/bin/env node
/**
 * The four tasks in the `@ngrx/signals` comparison table (llms-full.txt §13,
 * docs/compare/ngrx-signalstore.md).
 *
 * Those numbers — including "65.9x faster", the strongest competitive claim in
 * the documentation — had NO generator. `bench-compare.mjs` measures
 * @ngrx/signals, but a different workload (collection build/update/read, and
 * undo/redo), so it could not reproduce a single row of that table.
 *
 * The suspicion that prompted this: 65.9x is a ratio of two sub-microsecond
 * absolutes (0.02µs vs 1.22µs). Two ratios of that exact shape have already
 * turned out to be artifacts this release — the ST2018 multiplier, which swung
 * 47x-183x between runs, and a "31ns per consumer" result that vanished under
 * alternating measurement. A ratio whose denominator sits near the timer floor
 * is the first thing to distrust.
 *
 *   node tools/bench-vs-signalstore.mjs
 *   node tools/bench-vs-signalstore.mjs --json
 */
import {
  signalTree,
  entityMap,
  timeTravel,
} from '../dist/packages/core/dist/index.js';
import { signalState, patchState, getState } from '@ngrx/signals';
import { setAllEntities, updateEntity } from '@ngrx/signals/entities';

const ROUNDS = 9;
const WARMUP = 2;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const spread = (xs) => Math.max(...xs) - Math.min(...xs);

let sink = 0;

/**
 * Arms are INTERLEAVED, alternating which goes first each round.
 *
 * Measuring one arm to completion and then the other puts the second in a
 * different JIT state. That produced a phantom ~3000ns gap in
 * `bench-raw-signals.mjs` on its first draft, which disappeared entirely once
 * the arms alternated. The doc's own §13 preamble already warns about an
 * in-process race producing "a 7.5x phantom" — same family of mistake.
 */
function duel(label, armA, armB, opsPerRound) {
  const a = [],
    b = [];
  for (let r = 0; r < WARMUP + ROUNDS; r++) {
    if (r % 2 === 0) {
      a.push(armA());
      b.push(armB());
    } else {
      b.push(armB());
      a.push(armA());
    }
  }
  const A = a.slice(WARMUP),
    B = b.slice(WARMUP);
  return {
    label,
    tree: median(A) / opsPerRound,
    store: median(B) / opsPerRound,
    treeSpread: spread(A) / opsPerRound,
    storeSpread: spread(B) / opsPerRound,
  };
}

const deep = (v) => ({
  l1: {
    l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: v } } } } } } } },
  },
});
const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i, name: `r${i}`, v: i }));

// ── 1. Write one field 10 levels deep ───────────────────────────────────────
const N1 = 20_000;
const t1tree = () => {
  const t = signalTree(deep(0));
  const leaf = t.$.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10;
  const s = process.hrtime.bigint();
  for (let i = 0; i < N1; i++) leaf.set(i);
  sink += leaf();
  return Number(process.hrtime.bigint() - s) / 1000; // µs
};
/**
 * The immutable-update equivalent of one deep leaf write: rebuild the spine.
 * Written as a helper rather than ten nested spreads because the literal form
 * is unreadable and this is the arm the comparison hinges on — a reader has to
 * be able to check it is fair.
 */
const setDeep = (obj, depth, v) => {
  if (depth === 10) return { l10: v };
  const key = `l${depth + 1}`;
  return { ...obj, [key]: setDeep(obj[key], depth + 1, v) };
};

const t1store = () => {
  const st = signalState(deep(0));
  const s = process.hrtime.bigint();
  for (let i = 0; i < N1; i++) patchState(st, (c) => setDeep(c, 0, i));
  sink += st.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10();
  return Number(process.hrtime.bigint() - s) / 1000;
};

// ── 2. Update 1 row of 50k + dependent read ─────────────────────────────────
const BIG = 50_000,
  N2 = 200;
const t2tree = () => {
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
  t.$.rows.setAll(rows(BIG));
  const s = process.hrtime.bigint();
  for (let i = 0; i < N2; i++) {
    t.$.rows.updateOne(1, { v: i });
    sink += t.$.rows.count();
  }
  return Number(process.hrtime.bigint() - s) / 1000;
};
/**
 * Uses `@ngrx/signals/entities` — `setAllEntities` / `updateEntity` — NOT a
 * naive `.map()` over the array.
 *
 * The first draft mapped 50,000 rows per update and produced "482.8x faster",
 * which is a measurement of the wrong SignalStore rather than a fact about
 * SignalTree. `bench-compare.mjs` already had the fair shape; this arm now
 * matches it. Flattering numbers deserve the same suspicion as unflattering
 * ones — arguably more, since nobody goes looking for the error.
 */
const t2store = () => {
  const st = signalState({ entityMap: {}, ids: [] });
  patchState(st, setAllEntities(rows(BIG)));
  const s = process.hrtime.bigint();
  for (let i = 0; i < N2; i++) {
    patchState(st, updateEntity({ id: 1, changes: { v: i } }));
    sink += st.ids().length;
  }
  return Number(process.hrtime.bigint() - s) / 1000;
};

// ── 3. Write, then read whole state 10x ─────────────────────────────────────
const N3 = 2_000;
const t3tree = () => {
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }), n: 0 });
  t.$.rows.setAll(rows(1_000));
  const s = process.hrtime.bigint();
  for (let i = 0; i < N3; i++) {
    t.$.n.set(i);
    for (let k = 0; k < 10; k++) sink += Object.keys(t()).length;
  }
  return Number(process.hrtime.bigint() - s) / 1000;
};
const t3store = () => {
  const st = signalState({ rows: rows(1_000), n: 0 });
  const s = process.hrtime.bigint();
  for (let i = 0; i < N3; i++) {
    patchState(st, { n: i });
    for (let k = 0; k < 10; k++) sink += Object.keys(getState(st)).length;
  }
  return Number(process.hrtime.bigint() - s) / 1000;
};

// ── 4. 50 writes with undo history ──────────────────────────────────────────
// SignalStore has no history primitive, so its arm snapshots per change — which
// is what the absence forces a consumer to write.
const N4 = 50;
const t4tree = () => {
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) }).with(
    timeTravel()
  );
  t.$.rows.setAll(rows(1_000));
  const s = process.hrtime.bigint();
  for (let i = 0; i < N4; i++) t.$.rows.updateOne(1, { v: i });
  return Number(process.hrtime.bigint() - s) / 1000;
};
const t4store = () => {
  const st = signalState({ entityMap: {}, ids: [] });
  patchState(st, setAllEntities(rows(1_000)));
  const history = [];
  const s = process.hrtime.bigint();
  for (let i = 0; i < N4; i++) {
    // The snapshot is the point: SignalStore has no history primitive, so this
    // is what its absence forces a consumer to write. The WRITE itself uses the
    // proper entities updater, so only the history cost differs.
    history.push(structuredClone(getState(st)));
    patchState(st, updateEntity({ id: 1, changes: { v: i } }));
  }
  sink += history.length;
  return Number(process.hrtime.bigint() - s) / 1000;
};

/**
 * The scaling sweep — the part that is actually a claim.
 *
 * A single-n ratio is worthless here because the two implementations have
 * DIFFERENT COMPLEXITY, so the multiplier is a function of collection size, not
 * a property of either library. The published table quoted "22.8x" from one n;
 * the honest range across 1k-50k is roughly 15x to 1900x, and neither end means
 * anything on its own. What means something is the shape: flat against linear.
 *
 * `updateEntity` rebuilds the entity map — `{ ...map, [id]: next }` — which is
 * O(keys). SignalTree holds a signal per entity, so the write touches one.
 */
function scaling() {
  const out = [];
  for (const n of [1_000, 10_000, 50_000]) {
    const A = [],
      B = [];
    for (let r = 0; r < 5; r++) {
      const st = signalState({ entityMap: {}, ids: [] });
      patchState(st, setAllEntities(rows(n)));
      let t0 = process.hrtime.bigint();
      for (let i = 0; i < 100; i++)
        patchState(st, updateEntity({ id: 1, changes: { v: i } }));
      A.push(Number(process.hrtime.bigint() - t0) / 100 / 1000);

      const tr = signalTree({ rows: entityMap({ selectId: (x) => x.id }) });
      tr.$.rows.setAll(rows(n));
      t0 = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) tr.$.rows.updateOne(1, { v: i });
      B.push(Number(process.hrtime.bigint() - t0) / 100 / 1000);
      sink += tr.$.rows.count();
    }
    out.push({ n, store: median(A), tree: median(B) });
  }
  return out;
}

const scale = scaling();

const results = [
  duel('write one field 10 levels deep', t1tree, t1store, N1),
  duel('update 1 row of 50k + dependent read', t2tree, t2store, N2),
  duel('write, then read whole state 10x', t3tree, t3store, N3),
  duel('50 writes with undo history', t4tree, t4store, N4),
];

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results, scale }, null, 2));
} else {
  console.log(
    `\nSignalTree vs @ngrx/signals 21.1.1 — interleaved arms, median of ${ROUNDS}\n`
  );
  console.log(
    `  task                                    SignalTree   SignalStore   ratio`
  );
  for (const r of results) {
    const faster = r.store / r.tree;
    const verdict =
      Math.max(r.treeSpread, r.storeSpread) > Math.abs(r.store - r.tree)
        ? 'NOISE'
        : faster >= 1
        ? `${faster.toFixed(1)}x faster`
        : `${(1 / faster).toFixed(1)}x SLOWER`;
    console.log(
      `  ${r.label.padEnd(38)} ${r.tree.toFixed(3).padStart(8)}µs ${r.store
        .toFixed(3)
        .padStart(11)}µs   ${verdict}`
    );
    console.log(
      `  ${''.padEnd(38)} ±${r.treeSpread
        .toFixed(3)
        .padStart(7)}  ±${r.storeSpread
        .toFixed(3)
        .padStart(10)}   (round-to-round spread)`
    );
  }
  console.log(
    `\nSingle-entity update as the collection grows — the real claim\n`
  );
  console.log(`  collection     SignalStore     SignalTree`);
  for (const r of scale) {
    console.log(
      `  ${String(r.n).padStart(10)}   ${r.store
        .toFixed(2)
        .padStart(9)} µs   ${r.tree.toFixed(3).padStart(10)} µs`
    );
  }
  console.log(
    `\n  SignalStore is LINEAR in collection size — \`updateEntity\` rebuilds the` +
      `\n  entity map, which is O(keys). SignalTree is FLAT — one signal per entity,` +
      `\n  so the write touches one. Quote that shape. Do NOT quote a multiplier:` +
      `\n  it is a function of n (roughly 15x at 1k, ~1900x at 50k), so any single` +
      `\n  value is a statement about the fixture, not about either library.\n`
  );
  console.log(
    `\n  A row reads NOISE when the within-arm spread is larger than the gap` +
      `\n  between arms. Ratios of two sub-microsecond absolutes move with load;` +
      `\n  quote the absolutes and the spread, never the ratio alone.\n`
  );
}

if (sink === -1) console.log(sink);
