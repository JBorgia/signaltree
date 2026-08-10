#!/usr/bin/env node
/**
 * The cost of an inline predicate defeating the `where()`/`find()` memo — the
 * measurement behind ST2026.
 *
 * WHY THIS EXISTS. "0.27 ms hoisted against 20.54 ms inline over 1,000
 * entities", and the "75x" quoted beside it, appeared on two live surfaces
 * (docs/guides/migration-v13-v14.md, docs/guides/MIGRATION.md) with no tool
 * producing either. ST2026 is a diagnostic core emits at runtime; the figure
 * justifying a diagnostic should be re-derivable, for the same reason
 * `bench-array-leaf.mjs` exists for ST2018.
 *
 * WHAT IT MEASURES. `where(predicate)` memoises per predicate IDENTITY. A
 * hoisted arrow is one identity, so the filter runs once and every later read
 * is served from the memo. An inline arrow in a template allocates a fresh
 * identity on every change-detection cycle, so every read re-filters the whole
 * collection.
 *
 * The two arms therefore differ in what they can skip, not in what they
 * compute — which is why this is a real cost and not a microbenchmark artifact.
 *
 * Arms are INTERLEAVED with the fixture rebuilt each round, per the reasoning
 * in `bench-vs-signalstore.mjs`.
 *
 *   node tools/bench-predicate-memo.mjs
 *   node tools/bench-predicate-memo.mjs --json
 *   node tools/bench-predicate-memo.mjs --n 5000 --reads 200
 */
import { signalTree, entityMap } from '../dist/packages/core/dist/index.js';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const N = num('--n', 1_000);
const READS = num('--reads', 100);

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
  Array.from({ length: n }, (_, i) => ({ id: i, v: i, done: i % 3 === 0 }));

const fixture = () => {
  const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
  t.$.rows.setAll(rows(N));
  return t;
};

/** One predicate identity: filtered once, then served from the memo. */
const armHoisted = () => {
  const t = fixture();
  const notDone = (r) => !r.done;
  const s = process.hrtime.bigint();
  for (let i = 0; i < READS; i++) sink += t.$.rows.where(notDone)().length;
  return Number(process.hrtime.bigint() - s) / 1000;
};

/** A fresh identity every read — what an inline arrow in a template does. */
const armInline = () => {
  const t = fixture();
  const s = process.hrtime.bigint();
  for (let i = 0; i < READS; i++)
    sink += t.$.rows.where((r) => !r.done)().length;
  return Number(process.hrtime.bigint() - s) / 1000;
};

const ARMS = [
  ['hoisted predicate', armHoisted],
  ['inline predicate', armInline],
];

const samples = new Map(ARMS.map(([k]) => [k, []]));
for (let r = 0; r < WARMUP + ROUNDS; r++) {
  const order = r % 2 === 0 ? ARMS : [...ARMS].reverse();
  for (const [label, fn] of order) {
    const us = fn();
    if (r >= WARMUP) samples.get(label).push(us);
  }
}

const result = ARMS.map(([label]) => {
  const xs = samples.get(label);
  return { label, medianMs: median(xs) / 1000, spreadMs: spread(xs) / 1000 };
});

const hoisted = result[0],
  inline = result[1];
const gap = inline.medianMs - hoisted.medianMs;
const noisy = gap < Math.max(hoisted.spreadMs, inline.spreadMs);

if (asJson) {
  console.log(
    JSON.stringify(
      { n: N, reads: READS, rounds: ROUNDS, arms: result, noisy },
      null,
      2
    )
  );
} else {
  console.log(
    `\n${READS} reads of where() over ${N} entities — interleaved, median of ${ROUNDS}\n`
  );
  console.log(
    `  ${'arm'.padEnd(22)}${'median'.padStart(11)}${'spread'.padStart(11)}`
  );
  for (const r of result)
    console.log(
      `  ${r.label.padEnd(22)}${(r.medianMs.toFixed(2) + ' ms').padStart(11)}${('±' + r.spreadMs.toFixed(2)).padStart(11)}`
    );

  console.log(
    noisy
      ? `\n  NOISE — the gap (${gap.toFixed(2)} ms) is inside the round-to-round spread.\n` +
          `  Do not quote a ratio from this run.\n`
      : `\n  Inline costs ${(inline.medianMs / hoisted.medianMs).toFixed(1)}x the hoisted form at this fixture.\n` +
          `  The multiplier scales with reads-per-collection-size, so quote the two\n` +
          `  absolutes and the fixture, not the ratio alone.\n`
  );
  console.log(
    `  Both arms compute the same filter. The difference is entirely what the\n` +
      `  memo can skip: one predicate identity is filtered once, a fresh identity\n` +
      `  every read is filtered every time. That is what ST2026 warns about.\n`
  );
}

if (sink === Number.MIN_SAFE_INTEGER) console.log('');
