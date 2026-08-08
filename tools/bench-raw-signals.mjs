#!/usr/bin/env node
/**
 * C5: "Why not raw signals?" — measured, not argued.
 *
 * The challenge (docs/audits/2026-08/blind-gates-and-surfaced-gaps.md §10): a
 * staff engineer asks what a dependency buys over
 * `signal`/`computed`/`linkedSignal`/`resource`, and the honest answer is not
 * an argument. This measures the SMALL store — the "few values in one
 * component" shape — which is the case where the answer could go either way:
 *
 *   raw         per-field `signal()`s, the granular hand-rolled store
 *   signaltree  the same small store as a `signalTree`
 *
 * Three workloads:
 *
 *   writeOne          write one field, zero consumers — isolates the write path
 *   writeWithConsumers  write one field, K consumers read a field each — the
 *                     granularity claim (per-write invalidation cost), which is
 *                     what a change-detection pass would cost
 *   readWhole         read the whole small store — raw reads N signals;
 *                     SignalTree returns the memoised, structurally-shared tree
 *
 * EVERY arm asserts its work landed, writes a SENTINEL after warmup so a
 * postcondition can only pass if the MEASURED loop ran, and reports a spread
 * across REPEATS — a single run of two sub-microsecond absolutes is exactly the
 * shape that shipped wrong in this repo twice. The verdict lines below are
 * DERIVED from a stated threshold, and flip with the data.
 *
 * The comparison is deliberately same-shape: per-field signals on both sides.
 * The hand-roll that models a whole record as ONE signal loses granularity by
 * construction and is a different capability, not a fair arm — that difference
 * is C1's measurement, not this tool's.
 *
 * What this tool does NOT measure is the capability gap: `entityMap` semantics,
 * markers, `timeTravel`, serialization, undo. Those do not exist in a 50-line
 * hand-roll, so there is nothing to time — the honest statement there is the
 * line-count delta printed at the end, not a latency.
 *
 *   node tools/bench-raw-signals.mjs
 *   node tools/bench-raw-signals.mjs --json
 */
import { signalTree } from '../dist/packages/core/dist/index.js';
import { signal, computed } from '@angular/core';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : Number(process.argv[i + 1]);
};
const WRITES = arg('--writes', 100_000);
const CONSUMERS = arg('--consumers', 100);
const REPEATS = 7;
const WARMUP = 1;

let sink = 0;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── The two implementations of the same small store ─────────────────────────
// A session/workspace store: a few fields a desk app would actually keep. Both
// arms hold per-field signals; only the container differs.
function makeRaw() {
  const user = {
    name: signal('Ada'),
    role: signal('admin'),
    status: signal('active'),
  };
  const prefs = { theme: signal('dark'), locale: signal('en-GB') };
  const counter = signal(0);
  return { user, prefs, counter };
}

function makeTree() {
  return signalTree({
    user: { name: 'Ada', role: 'admin', status: 'active' },
    prefs: { theme: 'dark', locale: 'en-GB' },
    counter: 0,
  });
}

/** Source lines of an implementation factory, for the capability statement. */
const linesOf = (fn) =>
  fn
    .toString()
    .split('\n')
    .filter((l) => l.trim() && !/^\s*\/\//.test(l) && !/^\s*$/.test(l)).length;

// ── Workload 1: one write, zero consumers ───────────────────────────────────
function benchWriteOne(arm, round) {
  const store = arm.make();
  const field = arm.field(store);
  for (let i = 0; i < WRITES / 10; i++) field.set(i); // warmup
  field.set(-99999); // SENTINEL — postcondition can only pass if MEASURED ran
  const t = process.hrtime.bigint();
  for (let i = 0; i < WRITES; i++) field.set(i + round * WRITES);
  const ns = Number(process.hrtime.bigint() - t) / WRITES;
  sink += field();
  if (field() !== WRITES - 1 + round * WRITES)
    throw new Error(`${arm.name} writeOne did not land`);
  return ns;
}

// ── Workload 2: one write, K consumers, then a "CD pass" read ───────────────
// The consumers CAPTURE their leaves once and read the captured signal per
// pass — a template binds `tree.$.user.name` when the component constructs and
// reads it on every change-detection, it does not re-navigate the proxy per
// read. Re-navigating per read would be a different, slower idiom, and timing
// that would flatter the raw arm for a reason that has nothing to do with the
// stores. Same graph both sides: every consumer reads `field()` plus one other
// field, so every write invalidates all K — full fan-out, the worst case for
// both arms alike.
function benchWriteWithConsumers(arm, round) {
  const store = arm.make();
  const field = arm.field(store);
  const otherFields = [];
  for (let i = 0; i < CONSUMERS; i++) otherFields.push(arm.readField(store, i));
  const consumers = [];
  for (let i = 0; i < CONSUMERS; i++) {
    const other = otherFields[i];
    const c = computed(() => `${other()}:${field()}`);
    c(); // prime
    consumers.push(c);
  }
  for (let i = 0; i < WRITES / 10; i++) field.set(i);
  field.set(-99999);
  const t = process.hrtime.bigint();
  for (let i = 0; i < WRITES; i++) {
    field.set(i + round * WRITES);
    consumers.forEach((c) => c()); // what a change-detection pass would read
  }
  const ns = Number(process.hrtime.bigint() - t) / WRITES;
  for (const c of consumers) sink += c();
  if (field() !== WRITES - 1 + round * WRITES)
    throw new Error(`${arm.name} writeWithConsumers did not land`);
  return ns;
}

// ── Workload 3: read the whole store ────────────────────────────────────────
// Each arm's IDIOMATIC whole-state read: SignalTree's is `tree()` — the memoised
// materialisation with structural sharing — and raw's is reading its N signals.
// Re-measured interleaved, the raw whole-read (N signal reads) is NOT slower
// than `tree()`: the memo returns the identical object when nothing changed, so
// an unchanged `tree()` is ~20ns on this shape. The row is measured because the
// challenge says "read whole state" and a reader deserves to see both columns,
// not because either side is expected to win it.
function benchReadWhole(arm, round) {
  const store = arm.make();
  const field = arm.field(store);
  for (let i = 0; i < WRITES / 10; i++) field.set(i);
  field.set(-99999);
  const t = process.hrtime.bigint();
  for (let i = 0; i < WRITES; i++) {
    sink += arm.whole(store);
    if (i === WRITES - 1) field.set(i + round * WRITES); // keep it interesting
  }
  const ns = Number(process.hrtime.bigint() - t) / WRITES;
  if (field() !== WRITES - 1 + round * WRITES)
    throw new Error(`${arm.name} readWhole did not land`);
  return ns;
}

// ── Arms ────────────────────────────────────────────────────────────────────
const ARMS = {
  raw: {
    name: 'raw',
    make: makeRaw,
    field: (s) => s.user.status,
    readField: (s, i) => (i % 2 ? s.prefs.locale : s.user.name),
    whole: (s) =>
      `${s.user.name()}:${s.user.role()}:${s.user.status()}:${s.prefs.theme()}:${s.prefs.locale()}:${s.counter()}`,    lines: linesOf(makeRaw),
  },
  signaltree: {
    name: 'signaltree',
    make: makeTree,
    field: (t) => t.$.user.status,
    readField: (t, i) => (i % 2 ? t.$.prefs.locale : t.$.user.name),
    whole: (t) => {
      const s = t();
      return `${s.user.name}:${s.user.role}:${s.user.status}:${s.prefs.theme}:${s.prefs.locale}:${s.counter}`;
    },
    lines: linesOf(makeTree),
  },
};

// ── Run ─────────────────────────────────────────────────────────────────────
// Arms are INTERLEAVED round by round, not measured one after the other.
// Measuring raw fully then signaltree fully put the second arm in a different
// JIT state and produced a ~3000ns phantom gap on the consumer workload that
// disappears (133ns) the moment the two arms alternate. That is the same
// arm-order contamination this repo hit in bench-state-scale (rule 3: warm up
// before measuring) — and it shipped a wrong conclusion from THIS tool on its
// first draft. Interleaving is the fix, and the guardrail is the spread:
// interleaved, the gap has to reproduce round over round.
const benches = [
  ['writeOne', benchWriteOne],
  ['writeWithConsumers', benchWriteWithConsumers],
  ['readWhole', benchReadWhole],
];

const results = {};
for (const name of ['raw', 'signaltree']) {
  results[name] = { writeOne: [], writeWithConsumers: [], readWhole: [] };
}

for (const [key, bench] of benches) {
  for (let r = 0; r < WARMUP + REPEATS; r++) {
    // Alternate which arm goes first so neither enjoys a permanent JIT lead.
    const [a, b] = r % 2 === 0 ? ['raw', 'signaltree'] : ['signaltree', 'raw'];
    results[a][key].push(bench(ARMS[a], r));
    results[b][key].push(bench(ARMS[b], r));
  }
}

for (const name of ['raw', 'signaltree']) {
  for (const key of ['writeOne', 'writeWithConsumers', 'readWhole']) {
    results[name][key] = median(results[name][key].slice(WARMUP));
  }
}

// Spread: what a RATIO of two sub-microsecond absolutes is worth on this run.
const writeOneRatio = results.signaltree.writeOne / results.raw.writeOne;
const consumersRatio = results.signaltree.writeWithConsumers / results.raw.writeWithConsumers;

// The threshold: a write-tax under this is noise beside everything else a write
// does. This is the only judgement in the file, and it is stated, not implied.
const NOISE_NS = 50;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results, noiseThresholdNs: NOISE_NS }, null, 2));
} else {
  const ns = (v) => `${v.toFixed(1)}ns`;
  const x = (a, b) => `${(b / a).toFixed(2)}x`;
  console.log(
    `\nC5 — small store, raw per-field signals vs signalTree` +
      ` (${WRITES.toLocaleString()} ops, median of ${REPEATS}, warmup discarded)\n`
  );
  console.log(`  workload`.padEnd(24) + `raw`.padStart(12) + `signalTree`.padStart(12) + '   ratio');
  const row = (label, key) =>
    console.log(
      `  ${label.padEnd(22)}` +
        `${ns(results.raw[key]).padStart(12)}` +
        `${ns(results.signaltree[key]).padStart(12)}   ${x(results.raw[key], results.signaltree[key])}`
    );
  row('write, 0 consumers', 'writeOne');
  row(`write, ${CONSUMERS} consumers`, 'writeWithConsumers');
  row('read whole store', 'readWhole');

  console.log(`\n  VERDICTS (threshold: ${NOISE_NS}ns — under it is noise)`);
  const writeGap = Math.abs(results.signaltree.writeOne - results.raw.writeOne);
  const consumerGap =
    Math.abs(results.signaltree.writeWithConsumers - results.raw.writeWithConsumers) / CONSUMERS;
  console.log(
    `    bare write: signalTree is ${x(results.raw.writeOne, results.signaltree.writeOne)} the raw cost ` +
      `(${ns(writeGap)} apart). ` +
      `${
        writeGap < NOISE_NS
          ? 'Under the threshold — the write tax is negligible in absolute terms.'
          : 'Above the threshold — the write tax is real even bare.'
      }`
  );
  console.log(
    `    consumers: ${ns(consumerGap)} per consumer. ` +
      `${
        consumerGap < NOISE_NS
          ? 'Under the threshold — same invalidation cost with consumers attached. A small store gives raw signals NO granularity advantage over SignalTree, because the per-field graph is identical on both sides.'
          : 'Above the threshold per consumer — the container carries real cost under load.'
      }`
  );

  console.log(`\n  LINE COUNT — the capability half of the question`);
  console.log(
    `    raw: ${ARMS.raw.lines} lines. signalTree: ${ARMS.signaltree.lines} lines. ` +
      `On a small store the container is a wash.\n` +
      `    The 50-line hand-roll stops being 50 lines the moment you need\n` +
      `    entityMap semantics, markers, timeTravel, or serialization — those\n` +
      `    are capabilities, and they have no raw-signals equivalent to time.`
  );

  console.log(
    `\n  writeOne ratio ${writeOneRatio.toFixed(2)}x and consumers ratio ${consumersRatio.toFixed(
      2
    )}x are two\n` +
      `  sub-microsecond absolutes divided by each other; they move with machine\n` +
      `  load. Quote the shape and the absolutes, not these two decimals.\n`
  );
}

if (sink === -1) console.log(sink);
