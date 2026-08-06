#!/usr/bin/env node
/**
 * RETAINED HEAP — the axis bundle size does not measure.
 *
 * Bytes over the wire decide load time. Retained heap decides whether a page
 * survives on a low-end device, and it is a different question with a different
 * answer. SignalTree's shape — only leaves are Angular signals, branches are
 * plain accessors, writes are O(1) regardless of state size — should show up
 * here or nowhere.
 *
 * ⚠️ METHODOLOGY, learned expensively (docs/architecture/materialisation-prior-art.md §3.2):
 * a heap delta taken WITHOUT forced GC measures ALLOCATION, not RETENTION. The
 * same memo measurement read 25.71 MB un-GC'd and 3.32 MB with `--expose-gc` —
 * 8x high, and enough to have flipped a design recommendation. This file
 * REFUSES to run without `--expose-gc` rather than print a number that looks
 * like retention and is not.
 *
 * ⚠️ ONE PROCESS PER SCENARIO, for the same reason the benchmark rule requires
 * it (design-thesis §3): scenarios sharing a process contaminate each other.
 * The first draft of this file ran them all in one and produced a result that
 * could not be true — `entityMap 10k + a held snapshot` retained LESS than the
 * same entityMap alone. Strictly more data cannot retain less; the number was
 * an artefact of the previous scenario's garbage and V8's lazy reclamation.
 * The driver below spawns a child per scenario.
 *
 * Usage: node --expose-gc tools/memory-report.mjs [--json]
 *        node --expose-gc tools/memory-report.mjs --scenario <name>   (internal)
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (typeof globalThis.gc !== 'function') {
  console.error(
    '❌ Run with --expose-gc.\n' +
      '   Without it these numbers measure allocation, not retention — 8x high\n' +
      '   in the one case this repo has on record, and wrong in the direction\n' +
      '   that invents a memory problem.'
  );
  process.exit(1);
}

const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
if (!existsSync(CORE)) {
  console.error('❌ build first: nx run-many -t build --all');
  process.exit(1);
}
const { signalTree, entityMap } = await import(CORE);

const MB = 1024 * 1024;

/** Settle the heap: several GCs, because one pass leaves finalisables behind. */
function settle() {
  for (let i = 0; i < 4; i++) globalThis.gc();
}

/**
 * Retained bytes for whatever `build` returns, plus whether it is COLLECTABLE
 * once released.
 *
 * The collectability check is a `WeakRef`, not a heap delta. An earlier version
 * reported "reclaimed" as (heap with it held − heap after release) and made
 * every entityMap scenario look like a 2.3 MB leak. It was not: V8 does not
 * shrink `heapUsed` promptly even once objects are unreachable, so the delta
 * lagged. A WeakRef that no longer derefs is proof; a heap number that has not
 * come down yet is not evidence of anything.
 */
async function retained(build) {
  settle();
  const before = process.memoryUsage().heapUsed;
  let held = build();
  settle();
  const withHeld = process.memoryUsage().heapUsed;
  if (held === undefined) throw new Error('build() returned nothing');
  const ref = new WeakRef(typeof held === 'object' ? held : { held });
  held = null;
  settle();
  // A WeakRef is NOT cleared within the same synchronous turn, however many
  // times you call gc(). Yield to a macrotask first — without this every
  // scenario reports a leak, including a plain object, which is how this bug
  // announced itself.
  await new Promise((r) => setTimeout(r, 50));
  settle();
  return {
    retainedMB: (withHeld - before) / MB,
    collectable: ref.deref() === undefined,
  };
}

const { signal } = await import('@angular/core');

/** name -> builder. Each runs in its OWN process; see the header. */
const SCENARIOS = {
  'leaves-20k': {
    label: 'signalTree, 20k scalar leaves',
    n: 20_000,
    unit: 'leaf',
    build: (n) => {
      const shape = {};
      for (let i = 0; i < n; i++) shape['k' + i] = i;
      const t = signalTree(shape);
      void t.$;
      return t;
    },
  },
  'plain-object-20k': {
    label: 'plain object, 20k keys (floor)',
    n: 20_000,
    unit: 'key',
    build: (n) => {
      const o = {};
      for (let i = 0; i < n; i++) o['k' + i] = i;
      return o;
    },
  },
  'raw-signals-20k': {
    label: 'plain object of 20k RAW Angular signals',
    n: 20_000,
    unit: 'signal',
    build: (n) => {
      const o = {};
      for (let i = 0; i < n; i++) o['k' + i] = signal(i);
      return o;
    },
  },
  'entitymap-1k': {
    label: 'entityMap, 1k entities',
    n: 1_000,
    unit: 'entity',
    build: (n) => {
      const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
      const data = [];
      for (let i = 0; i < n; i++) data.push({ id: i, name: 'n' + i, v: i });
      t.$.rows.setAll(data);
      void t.$.rows.all();
      return t;
    },
  },
  'entitymap-10k': {
    label: 'entityMap, 10k entities',
    n: 10_000,
    unit: 'entity',
    build: (n) => {
      const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
      const data = [];
      for (let i = 0; i < n; i++) data.push({ id: i, name: 'n' + i, v: i });
      t.$.rows.setAll(data);
      void t.$.rows.all();
      return t;
    },
  },
  'entitymap-10k-snapshot': {
    label: 'entityMap 10k + a held tree() snapshot',
    n: 10_000,
    unit: 'entity',
    build: (n) => {
      const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
      const data = [];
      for (let i = 0; i < n; i++) data.push({ id: i, name: 'n' + i, v: i });
      t.$.rows.setAll(data);
      return { t, snap: t() };
    },
  },
};

// --- child mode: run exactly one scenario, print JSON, exit ----------------
const scenarioFlag = process.argv.indexOf('--scenario');
if (scenarioFlag !== -1) {
  const name = process.argv[scenarioFlag + 1];
  const s = SCENARIOS[name];
  if (!s) {
    console.error(`unknown scenario: ${name}`);
    process.exit(1);
  }
  const r = await retained(() => s.build(s.n));
  console.log(
    JSON.stringify({
      scenario: s.label,
      n: s.n,
      unit: s.unit,
      retainedMB: +r.retainedMB.toFixed(2),
      collectable: r.collectable,
      bytesPerUnit: Math.round((r.retainedMB * MB) / s.n),
    })
  );
  process.exit(0);
}

// --- driver: one child per scenario ---------------------------------------
const { execFileSync } = await import('node:child_process');
const rows = [];
for (const name of Object.keys(SCENARIOS)) {
  const out = execFileSync(
    process.execPath,
    ['--expose-gc', new URL(import.meta.url).pathname, '--scenario', name],
    { encoding: 'utf8', cwd: process.cwd() }
  );
  rows.push(JSON.parse(out.trim().split('\n').pop()));
}

// --- repeated-read growth, its own child too ------------------------------
let readGrowth = 0;
{
  const code = `
    const { signalTree, entityMap } = await import(${JSON.stringify(CORE)});
    const settle = () => { for (let i=0;i<4;i++) globalThis.gc(); };
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    const data = [];
    for (let i = 0; i < 5000; i++) data.push({ id: i, name: 'n'+i, v: i });
    t.$.rows.setAll(data);
    t();
    settle();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 2000; i++) void t();
    settle();
    console.log(((process.memoryUsage().heapUsed - before) / (1024*1024)).toFixed(3));
  `;
  readGrowth = Number(
    execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', code], {
      encoding: 'utf8',
      cwd: process.cwd(),
    }).trim()
  );
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, readGrowthMB: +readGrowth.toFixed(3) }, null, 2));
} else {
  console.log('RETAINED HEAP (forced GC, held live then released)\n');
  console.log(
    '  scenario'.padEnd(46) + 'retained'.padStart(10) + 'per unit'.padStart(14) +
      '  collectable'
  );
  console.log('  ' + '─'.repeat(77));
  for (const r of rows) {
    console.log(
      '  ' + r.scenario.padEnd(44) +
        `${r.retainedMB.toFixed(2)} MB`.padStart(10) +
        `${r.bytesPerUnit} B/${r.unit}`.padStart(14) +
        `       ${r.collectable ? '✅' : '❌ LEAK'}`
    );
  }
  console.log(
    `\n  2,000 repeated tree() reads grew the heap by ${readGrowth.toFixed(3)} MB` +
      `\n  (a memo that grows per READ rather than per WRITE would be a leak in any` +
      `\n   app that renders in a loop — this is the check for that.)`
  );
  console.log(
    '\n  "collectable" is a WeakRef check after release — the definitive test.' +
      '\n  A heap delta that has not come back down yet is NOT evidence of a leak;' +
      '\n  V8 reclaims lazily, and reading it that way invented one here.'
  );
}
