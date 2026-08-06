#!/usr/bin/env node
/**
 * CROSS-LIBRARY RETAINED HEAP — the comparison `memory-report.mjs` deliberately
 * did not make.
 *
 * The benchmark orchestrator already reports a `memoryDeltaMB`, and it answers a
 * different question than it appears to:
 *
 *   - it is an un-GC'd `performance.memory.usedJSHeapSize` delta, so it measures
 *     ALLOCATION CHURN over the run, not memory RETAINED afterwards. This repo
 *     has that error on record at 8x (materialisation-prior-art §3.2);
 *   - `trackMemory: true` is set on only 2 of the 7 arms, so there is no
 *     cross-library memory comparison to read even if the metric were right.
 *
 * (The timing comparison is NOT affected: the instrumentation's idle wait
 * happens before `t0` and the second reading after `t1`, so the timed region is
 * clean. Checked, because an asymmetric measurement that biased timing would be
 * a much worse problem than an unclear metric.)
 *
 * This measures what a phone actually runs out of: bytes still held after the
 * collection is built. Forced GC, ONE PROCESS PER ARM, `WeakRef` for
 * collectability.
 *
 * Arms are limited to what runs without an Angular JIT bootstrap — @ngrx/store,
 * @ngxs/store and akita need one, and standing up a full Angular environment per
 * arm would introduce a much larger confound than the comparison is worth.
 *
 * ⚠️ MARGINAL cost, measured at two sizes. Each arm imports its library inside
 * the measured region, so a single-size measurement divides that fixed
 * module-load cost by N and reports it as per-entity. The first version of this
 * file did exactly that and made SignalTree look ~2.6x more expensive per entity
 * than it is (827 B against a true marginal ~226 B). Running N and 10N and
 * taking the slope cancels every fixed cost — module load, Angular init, the
 * harness itself.
 *
 * Usage: node --expose-gc tools/memory-compare.mjs [--n 10000] [--json]
 *        node --expose-gc tools/memory-compare.mjs --arm <name> --n <n>  (internal)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (typeof globalThis.gc !== 'function') {
  console.error('❌ Run with --expose-gc — without it this measures allocation, not retention.');
  process.exit(1);
}
const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
if (!existsSync(CORE)) {
  console.error('❌ build first: nx run-many -t build --all');
  process.exit(1);
}

const nFlag = process.argv.indexOf('--n');
const N = nFlag !== -1 ? Number(process.argv[nFlag + 1]) : 10_000;
const MB = 1024 * 1024;

const rows = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: i, name: 'name' + i, value: i, active: i % 2 === 0 });
  return out;
};

/** Each arm builds its library's idiomatic collection of `n` entities. */
const ARMS = {
  signaltree: async (n) => {
    const { signalTree, entityMap } = await import(CORE);
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    t.$.rows.setAll(rows(n));
    void t.$.rows.all();
    return t;
  },
  'raw-angular-signals': async (n) => {
    const { signal } = await import('@angular/core');
    // The idiomatic raw equivalent: one signal holding the collection.
    const s = signal(rows(n));
    void s();
    return s;
  },
  'ngrx-signals': async (n) => {
    const { signalState } = await import('@ngrx/signals');
    const s = signalState({ rows: rows(n) });
    void s.rows();
    return s;
  },
  elf: async (n) => {
    const { createStore, withProps } = await import('@ngneat/elf');
    const { withEntities, setEntities, selectAllEntities } = await import(
      '@ngneat/elf-entities'
    );
    const store = createStore(
      { name: 'bench' },
      withProps({}),
      withEntities({ initialValue: [] })
    );
    store.update(setEntities(rows(n)));
    const sub = store.pipe(selectAllEntities()).subscribe(() => undefined);
    return { store, sub };
  },
};

// --- child mode -------------------------------------------------------------
const armFlag = process.argv.indexOf('--arm');
if (armFlag !== -1) {
  const name = process.argv[armFlag + 1];
  const build = ARMS[name];
  if (!build) {
    console.error(`unknown arm: ${name}`);
    process.exit(1);
  }
  const settle = () => {
    for (let i = 0; i < 4; i++) globalThis.gc();
  };
  settle();
  const before = process.memoryUsage().heapUsed;
  let held = await build(N);
  settle();
  const withHeld = process.memoryUsage().heapUsed;
  const ref = new WeakRef(typeof held === 'object' ? held : { held });
  held = null;
  settle();
  // A WeakRef is not cleared in the same synchronous turn, however many gc()s.
  await new Promise((r) => setTimeout(r, 50));
  settle();
  console.log(
    JSON.stringify({
      arm: name,
      retainedMB: +((withHeld - before) / MB).toFixed(2),
      bytesPerEntity: Math.round((withHeld - before) / N),
      collectable: ref.deref() === undefined,
    })
  );
  process.exit(0);
}

// --- driver: two sizes per arm, marginal cost from the slope ----------------
const SMALL = Math.max(1, Math.round(N / 10));
const run = (arm, n) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ['--expose-gc', new URL(import.meta.url).pathname, '--arm', arm, '--n', String(n)],
      { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    )
      .trim()
      .split('\n')
      .pop()
  );

const results = [];
for (const arm of Object.keys(ARMS)) {
  try {
    const small = run(arm, SMALL);
    const big = run(arm, N);
    const marginal = Math.round(
      ((big.retainedMB - small.retainedMB) * MB) / (N - SMALL)
    );
    results.push({
      arm,
      retainedMB: big.retainedMB,
      bytesPerEntity: marginal,
      fixedMB: +(big.retainedMB - (marginal * N) / MB).toFixed(2),
      collectable: big.collectable && small.collectable,
    });
  } catch (err) {
    results.push({ arm, error: String(err.message).split('\n')[0].slice(0, 80) });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ n: N, results }, null, 2));
} else {
  console.log(`RETAINED HEAP holding ${N.toLocaleString()} entities`);
  console.log('forced GC, one process per arm, WeakRef collectability\n');
  console.log(
    '  arm'.padEnd(26) + `@${N / 1000}k`.padStart(11) + 'MARGINAL'.padStart(14) +
      'fixed'.padStart(10) + '  ok'
  );
  console.log('  ' + '─'.repeat(68));
  for (const r of results.sort((a, b) => (a.retainedMB ?? 1e9) - (b.retainedMB ?? 1e9))) {
    if (r.error) {
      console.log('  ' + r.arm.padEnd(24) + '  — ' + r.error);
      continue;
    }
    console.log(
      '  ' + r.arm.padEnd(24) +
        `${r.retainedMB.toFixed(2)} MB`.padStart(11) +
        `${r.bytesPerEntity} B/ent`.padStart(14) +
        `${r.fixedMB.toFixed(2)} MB`.padStart(10) +
        `  ${r.collectable ? '✅' : '❌'}`
    );
  }
  console.log(
    '\n  MARGINAL is the slope between ' + SMALL.toLocaleString() + ' and ' +
      N.toLocaleString() + ' entities, so every FIXED cost\n' +
      '  (module load, Angular init, the harness) cancels. It is the only column\n' +
      '  that answers "what does one more row cost". The entity objects\n' +
      '  themselves are ~89 B of it, and no library controls that part.'
  );
}
