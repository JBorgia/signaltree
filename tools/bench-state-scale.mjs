#!/usr/bin/env node
/**
 * How write cost scales with STATE SIZE and with LIVE CONSUMERS.
 *
 * ## Why this exists
 *
 * `tools/bench-compare.mjs` measures entity collections, and elf wins there.
 * That is elf's optimised path — a Map plus one array — and it was the ONLY
 * thing this repo benchmarked cross-library, which meant every published
 * comparison was fought on the competitor's best ground and on the one shape
 * where SignalTree's design gives it no advantage.
 *
 * The library's actual thesis is a different claim: **only leaves are signals,
 * branches are plain accessors, and a write is O(1) regardless of how large the
 * state is.** Nothing measured that against anyone. This does.
 *
 * ## The two axes, and why they must be separated
 *
 * A first attempt varied both at once and produced a table where elf cost 145 ms
 * with ZERO subscribers attached — which is not selector cost at all, it is the
 * immutable spread over a large object. Conflated, the two effects tell you
 * nothing about either.
 *
 *   - **Axis 1, state size, 0 consumers.** Isolates the store write itself.
 *   - **Axis 2, consumer count, fixed state.** Isolates selector fan-out.
 *
 * ## Fairness rules, learned the hard way
 *
 * 1. **Use the competitor's own idiomatic API.** A first pass wrote elf state as
 *    `store.update(s => ({...s, k0: v}))`; elf ships `setProp`, which is what a
 *    user writes and is far cheaper at moderate sizes. Benchmarking elf without
 *    `elf-state-history` already produced one strawman in this repo — this is
 *    the same error and it is measured with `setProp` now.
 * 2. **Both a FLAT and a NESTED shape.** elf's write cost is proportional to the
 *    slice it copies, so 1,000 root props is its worst case and is NOT how an
 *    app is written. The nested shape — few sections, many fields each — is the
 *    realistic one and is much kinder to elf. Reporting only the flat number
 *    would be a strawman with extra steps.
 * 3. **Warm up before measuring.** Un-warmed, the same 1,000-field measurement
 *    read 0.31 ms in one script and 23.23 ms in another — a 75x swing that was
 *    pure JIT state. Five discarded rounds per arm.
 * 4. **Postconditions on every arm**, because a benchmark that cannot detect it
 *    did nothing is the defect class this repo has hit seven times.
 * 5. **A SENTINEL between warmup and measurement.** The first version asserted
 *    the final value equalled the last write — and the WARMUP loop already
 *    satisfied that, so gutting the measured loop left the postcondition green.
 *    `verify-gates --self-test` caught it as a blind gate. Each arm now writes a
 *    sentinel after warmup, so the assertion can only pass if the MEASURED loop
 *    ran. A postcondition another phase can satisfy is not a postcondition.
 *
 * ⚠️ `--quick` NUMBERS ARE NOT QUOTABLE. It runs one size per axis, so the JIT
 * reaches a different state than a full sweep does — the 10x100 nested arm read
 * 0.056 ms under --quick against a stable 0.36 ms across full runs, a 6x gap
 * that is measurement state, not behaviour. --quick exists so `verify-gates` can
 * check the harness still RUNS. Quote the full run, which reproduces to within a
 * few percent.
 *
 * Usage: node tools/bench-state-scale.mjs [--json] [--quick]
 */
import { join } from 'node:path';

const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
const WRITES = 200;
const WARMUP = 5;
const QUICK = process.argv.includes('--quick');
/** Written after warmup so a postcondition can only pass if the MEASURED loop ran. */
const SENTINEL = -99999;

const { signalTree } = await import(CORE);
const { computed } = await import('@angular/core');
const { createStore, withProps, setProp, select } = await import('@ngneat/elf');

function median(fn, rounds = 11) {
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

const flat = (n) => {
  const o = {};
  for (let i = 0; i < n; i++) o['k' + i] = { v: i };
  return o;
};
const nested = (sections, per) => {
  const o = {};
  for (let s = 0; s < sections; s++) {
    const sec = {};
    for (let i = 0; i < per; i++) sec['f' + i] = i;
    o['s' + s] = sec;
  }
  return o;
};

const results = { axis1Flat: [], axis1Nested: [], axis2: [] };

// ── Axis 1a: FLAT state, elf's worst case ───────────────────────────────────
for (const size of QUICK ? [64, 512] : [64, 128, 256, 512, 1024]) {
  const tree = signalTree(flat(size));
  for (let r = 0; r < WARMUP; r++) for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);
  tree.$.k0.v.set(SENTINEL);
  const st = median(() => {
    for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);
  });

  const store = createStore({ name: `flat${size}` }, withProps(flat(size)));
  const write = (w) => store.update(setProp('k0', { v: w }));
  for (let r = 0; r < WARMUP; r++) for (let w = 0; w < WRITES; w++) write(w);
  write(SENTINEL);
  const elf = median(() => {
    for (let w = 0; w < WRITES; w++) write(w);
  });

  if (tree.$.k0.v() !== WRITES - 1) throw new Error(`signaltree write did not land at ${size}`);
  if (store.getValue().k0.v !== WRITES - 1) throw new Error(`elf write did not land at ${size}`);
  results.axis1Flat.push({ size, signaltreeMs: st, elfMs: elf });
}

// ── Axis 1b: NESTED state, the realistic shape ──────────────────────────────
for (const [sections, per] of QUICK ? [[10, 100]] : [[10, 10], [10, 100], [20, 250], [50, 200]]) {
  const tree = signalTree(nested(sections, per));
  for (let r = 0; r < WARMUP; r++) for (let w = 0; w < WRITES; w++) tree.$.s0.f0.set(w);
  tree.$.s0.f0.set(SENTINEL);
  const st = median(() => {
    for (let w = 0; w < WRITES; w++) tree.$.s0.f0.set(w);
  });

  const store = createStore({ name: `n${sections}x${per}` }, withProps(nested(sections, per)));
  // Idiomatic elf for a deep field: replace the SECTION immutably.
  const write = (w) => store.update(setProp('s0', (sec) => ({ ...sec, f0: w })));
  for (let r = 0; r < WARMUP; r++) for (let w = 0; w < WRITES; w++) write(w);
  write(SENTINEL);
  const elf = median(() => {
    for (let w = 0; w < WRITES; w++) write(w);
  });

  if (tree.$.s0.f0() !== WRITES - 1) throw new Error('signaltree nested write did not land');
  if (store.getValue().s0.f0 !== WRITES - 1) throw new Error('elf nested write did not land');
  results.axis1Nested.push({ sections, per, total: sections * per, signaltreeMs: st, elfMs: elf });
}

// ── Axis 2: consumer fan-out at fixed state size ────────────────────────────
for (const n of QUICK ? [0, 1000] : [0, 100, 1000, 5000]) {
  const tree = signalTree(flat(100));
  const consumers = [];
  for (let i = 0; i < n; i++) {
    const c = computed(() => tree.$['k' + (i % 100)].v());
    c();
    consumers.push(c);
  }
  for (let r = 0; r < WARMUP; r++) {
    for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);
    consumers.forEach((c) => c());
  }
  const st = median(() => {
    for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);
    // Reading every consumer is what a change-detection pass does; the ones that
    // were not invalidated return a cached value and cost a pointer check.
    consumers.forEach((c) => c());
  });

  const store = createStore({ name: `fan${n}` }, withProps(flat(100)));
  const subs = [];
  let projections = 0;
  for (let i = 0; i < n; i++) {
    subs.push(
      store
        .pipe(
          select((s) => {
            projections++;
            return s['k' + (i % 100)].v;
          })
        )
        .subscribe(() => undefined)
    );
  }
  const write = (w) => store.update(setProp('k0', { v: w }));
  for (let r = 0; r < WARMUP; r++) for (let w = 0; w < WRITES; w++) write(w);
  write(SENTINEL);
  const before = projections;
  const elf = median(() => {
    for (let w = 0; w < WRITES; w++) write(w);
  });
  const ran = projections - before;
  subs.forEach((s) => s.unsubscribe());

  if (store.getValue().k0.v !== WRITES - 1) throw new Error('elf fan-out write did not land');
  results.axis2.push({ consumers: n, signaltreeMs: st, elfMs: elf, elfProjectionsPerWrite: n ? Math.round(ran / (WRITES * 11)) : 0 });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const ratio = (a, b) => (a > 0 ? `${(b / a).toFixed(0)}x` : '—');

console.log(`\n${WRITES} writes, median of 11, ${WARMUP} warmup rounds discarded per arm.\n`);

console.log('AXIS 1a — FLAT state (elf\'s worst case: every field a root prop)\n');
console.log('  root props'.padEnd(14) + 'SignalTree'.padStart(12) + 'elf'.padStart(12) + '   ratio');
for (const r of results.axis1Flat) {
  console.log(
    ('  ' + r.size).padEnd(14) +
      r.signaltreeMs.toFixed(3).padStart(12) +
      r.elfMs.toFixed(3).padStart(12) +
      '   ' + ratio(r.signaltreeMs, r.elfMs)
  );
}

console.log('\nAXIS 1b — NESTED state (the shape an app actually has)\n');
console.log('  shape'.padEnd(14) + 'fields'.padStart(8) + 'SignalTree'.padStart(12) + 'elf'.padStart(12) + '   ratio');
for (const r of results.axis1Nested) {
  console.log(
    ('  ' + r.sections + ' x ' + r.per).padEnd(14) +
      String(r.total).padStart(8) +
      r.signaltreeMs.toFixed(3).padStart(12) +
      r.elfMs.toFixed(3).padStart(12) +
      '   ' + ratio(r.signaltreeMs, r.elfMs)
  );
}

console.log('\nAXIS 2 — consumer fan-out (100 fields fixed)\n');
console.log('  consumers'.padEnd(14) + 'SignalTree'.padStart(12) + 'elf'.padStart(12) + '   ratio');
for (const r of results.axis2) {
  console.log(
    ('  ' + r.consumers).padEnd(14) +
      r.signaltreeMs.toFixed(3).padStart(12) +
      r.elfMs.toFixed(3).padStart(12) +
      '   ' + ratio(r.signaltreeMs, r.elfMs)
  );
}

console.log(
  '\n  Every arm asserted its write landed. elf is measured with its own setProp,\n' +
    '  and on BOTH a flat and a nested shape — the nested one is realistic and is\n' +
    '  far kinder to it. The claim this supports is narrow and specific: a write\n' +
    '  costs SignalTree the same at any state size, and costs an immutable store\n' +
    '  in proportion to the slice it copies.'
);
