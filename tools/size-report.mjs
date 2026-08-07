#!/usr/bin/env node
/**
 * What a consumer actually PAYS, feature by feature.
 *
 * `check-bundle-budget.mjs` gates three fixed scenarios. This answers the wider
 * question — what does each marker, enhancer and subpath cost, and does
 * anything fail to tree-shake — so structural decisions are made on measurement
 * rather than on the shape of the source tree.
 *
 * Everything is a PRODUCTION build (`ngDevMode: false`), own code only
 * (@angular/rxjs/tslib external), gzipped. Each feature is EXERCISED, not merely
 * imported: importing a symbol and never calling it measures the tree-shaker,
 * not the feature.
 *
 * Usage: node tools/size-report.mjs [--json]
 *        (requires `nx run-many -t build --all` first)
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
const NM = join(process.cwd(), 'node_modules');
if (!existsSync(CORE)) {
  console.error('❌ build first: nx run-many -t build --all');
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'st-size-'));
const sub = (p) => JSON.stringify(join(process.cwd(), `dist/packages/core/dist/${p}`));

async function kb(code, id) {
  const entry = join(dir, `${id}.js`);
  writeFileSync(entry, code, 'utf8');
  const out = await build({
    entryPoints: [entry], bundle: true, minify: true, format: 'esm',
    platform: 'browser', treeShaking: true,
    external: ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'],
    nodePaths: [NM], write: false, legalComments: 'none', logLevel: 'silent',
    define: { ngDevMode: 'false' },
  });
  return gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length / 1024;
}

const C = JSON.stringify(CORE);
const BASE = `
  import { signalTree } from ${C};
  const t = signalTree({ count: 0, user: { name: 'a' } });
  t.$.count.set(1); t.$.user({ name: 'b' });
  globalThis.__sink = [t.$.count(), t()];
`;

const MARKERS = [
  ['entityMap (plain)', 'entityMap', `
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    t.$.rows.addOne({ id: 1 }); t.$.rows.updateOne(1, {});
    globalThis.__sink = [t.$.rows.all(), t.$.rows.count()];`],
  ['entityMap + loader', 'entityMap, loader', `
    const t = signalTree({ rows: entityMap({ selectId: (r) => r.id, load: loader(async () => []) }) });
    t.$.rows.load(); globalThis.__sink = [t.$.rows.all(), t.$.rows.loading()];`],
  ['status', 'status', `
    const t = signalTree({ j: status() });
    t.$.j.setLoaded(); t.$.j.setError(new Error('x'));
    globalThis.__sink = [t.$.j.state(), t.$.j.loading(), t.$.j.settled()];`],
  ['stored', 'stored', `
    const t = signalTree({ k: stored('k', 'v') });
    t.$.k.set('w'); globalThis.__sink = [t.$.k()];`],
  ['form', 'form', `
    const t = signalTree({ f: form({ initial: { a: '' } }) });
    t.$.f.patch({ a: 'x' }); globalThis.__sink = [t.$.f(), t.$.f.valid()];`],
  ['compared', 'compared, byKeys', `
    const t = signalTree({ u: compared({ id: 1, v: 1 }, byKeys('id', 'v')) });
    t.$.u.set({ id: 1, v: 2 }); globalThis.__sink = [t.$.u()];`],
  ['asyncSource', 'asyncSource', `
    const t = signalTree({ s: asyncSource({ load: async () => 1 }) });
    globalThis.__sink = [t.$.s(), t.$.s.loading()];`],
  ['asyncQuery', 'asyncQuery', `
    const t = signalTree({ q: asyncQuery({ initialResult: 0, query: async () => 1 }) });
    globalThis.__sink = [t.$.q(), t.$.q.loading()];`],
];

const ENHANCERS = [
  ['batching', 'batching', 'batching()', 't.batch(() => t.$.count.set(2));'],
  ['timeTravel', 'timeTravel', 'timeTravel()', 't.undo(); t.redo();'],
  ['serialization', 'serialization', 'serialization()', 'globalThis.__s = t.serialize();'],
  ['devTools', 'devTools', 'devTools()', 't.connectDevTools();'],
  ['persistence', 'persistence', "persistence({ key: 'k' })", 't.save();'],

];

// `audit` is not an enhancer — it is `createAuditTracker(tree, config)`,
// measured separately below rather than pretended into the enhancer shape.
const STANDALONE = [
  ['createAuditTracker', `
    import { signalTree, createAuditTracker } from ${C};
    const t = signalTree({ count: 0 });
    const a = createAuditTracker(t, {});
    t.$.count.set(1);
    globalThis.__sink = [a];`],
];

const SUBPATHS = [
  ['core/storage', `import { createIndexedDBAdapter } from ${sub('enhancers/serialization/storage-adapters.js')};
     globalThis.__sink = createIndexedDBAdapter();`],
];

const base = await kb(BASE, 'base');
const out = { baseKB: +base.toFixed(2), markers: [], enhancers: [], subpaths: [], notes: [] };

for (const [label, imports, body] of MARKERS) {
  const code = `import { signalTree, ${imports} } from ${C};\n${body}`;
  const k = await kb(code, label.replace(/\W+/g, '_'));
  out.markers.push({ feature: label, totalKB: +k.toFixed(2), deltaKB: +(k - base).toFixed(2) });
}
for (const [label, imports, apply, use] of ENHANCERS) {
  const code = `
    import { signalTree, ${imports} } from ${C};
    const t = signalTree({ count: 0 }).with(${apply});
    t.$.count.set(1); ${use}
    globalThis.__sink = [t.$.count()];`;
  const k = await kb(code, 'enh_' + label);
  out.enhancers.push({ feature: label, totalKB: +k.toFixed(2), deltaKB: +(k - base).toFixed(2) });
}
out.standalone = [];
for (const [label, code] of STANDALONE) {
  const k = await kb(code, 'sa_' + label);
  out.standalone.push({ feature: label, totalKB: +k.toFixed(2), deltaKB: +(k - base).toFixed(2) });
}
for (const [label, code] of SUBPATHS) {
  const k = await kb(code, 'sp_' + label.replace(/\W+/g, '_'));
  out.subpaths.push({ feature: label, totalKB: +k.toFixed(2) });
}

// Realistic combinations — what an app actually ships.
const COMBOS = [
  ['typical app (entityMap + status + form)', `
    import { signalTree, entityMap, status, form } from ${C};
    const t = signalTree({
      rows: entityMap({ selectId: (r) => r.id }), j: status(), f: form({ initial: { a: '' } }) });
    t.$.rows.addOne({ id: 1 }); t.$.j.setLoaded(); t.$.f.patch({ a: 'x' });
    globalThis.__sink = [t.$.rows.all(), t.$.j.state(), t.$.f()];`],
  ['everything', `
    import { signalTree, entityMap, status, stored, form, compared, byKeys,
             asyncSource, asyncQuery, loader, batching, timeTravel, serialization } from ${C};
    const t = signalTree({
      rows: entityMap({ selectId: (r) => r.id, load: loader(async () => []) }),
      j: status(), k: stored('k','v'), f: form({ initial: { a: '' } }),
      u: compared({ id: 1 }, byKeys('id')),
      s: asyncSource({ load: async () => 1 }),
      q: asyncQuery({ initialResult: 0, query: async () => 1 }),
    }).with(batching()).with(timeTravel()).with(serialization());
    t.$.rows.addOne({ id: 1 }); t.$.j.setLoaded(); t.$.f.patch({ a: 'x' });
    t.batch(() => t.$.k.set('w')); t.undo();
    globalThis.__sink = [t.serialize()];`],
];
out.combos = [];
for (const [label, code] of COMBOS) {
  const k = await kb(code, 'combo_' + label.replace(/\W+/g, '_'));
  out.combos.push({ feature: label, totalKB: +k.toFixed(2), deltaKB: +(k - base).toFixed(2) });
}

/**
 * A measured size of ~zero means the build is empty, not that the library is
 * free.
 *
 * The only guard here was `existsSync` on the built barrel, and an EMPTY file
 * exists. A truncated or failed build therefore produced a size table full of
 * near-zero numbers and exited 0 — a reporter's worst failure mode, because the
 * output looks like a spectacular result rather than a broken run.
 */
if (!(base > 0.5)) {
  console.error(
    `\n✗ the bare signalTree bundle measured ${base.toFixed(2)}KB gzip.\n` +
      `  That is not a real measurement — the built barrel is empty or truncated.\n` +
      `  Rebuild with \`nx run-many -t build --all\` before trusting any number here.`
  );
  process.exit(1);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const row = (r) =>
    `  ${r.feature.padEnd(38)} ${String(r.totalKB.toFixed(2)).padStart(6)} KB` +
    (r.deltaKB === undefined ? '' : `   +${r.deltaKB.toFixed(2)}`);
  console.log('Production (ngDevMode:false), own code only, gzipped\n');
  console.log(`  ${'bare signalTree'.padEnd(38)} ${base.toFixed(2).padStart(6)} KB\n`);
  console.log('MARKERS (delta over bare)');
  out.markers.forEach((r) => console.log(row(r)));
  console.log('\nENHANCERS (delta over bare)');
  out.enhancers.forEach((r) => console.log(row(r)));
  console.log('\nSTANDALONE HELPERS (delta over bare)');
  out.standalone.forEach((r) => console.log(row(r)));
  console.log('\nSUBPATH, imported alone');
  out.subpaths.forEach((r) => console.log(row(r)));
  console.log('\nREALISTIC COMBINATIONS');
  out.combos.forEach((r) => console.log(row(r)));
  // The "everything" combo uses entityMap WITH a loader, so summing both
  // entityMap rows would double-count it and overstate the sharing.
  const additive =
    out.markers
      .filter((r) => r.feature !== 'entityMap (plain)')
      .reduce((a, r) => a + r.deltaKB, 0) +
    out.enhancers
      .filter((r) => ['batching', 'timeTravel', 'serialization'].includes(r.feature))
      .reduce((a, r) => a + r.deltaKB, 0);
  const everything = out.combos.find((c) => c.feature === 'everything');
  console.log(
    `\n  If every feature's cost were additive, "everything" would be ` +
      `+${additive.toFixed(2)} KB.\n  Measured: +${everything.deltaKB.toFixed(2)} KB — about ` +
      `${(additive - everything.deltaKB).toFixed(2)} KB of shared machinery.\n` +
      `  A combo much LARGER than additive would mean something is NOT being shared.`
  );
  console.log('\n  Analysis: docs/architecture/size-structure-review.md');
}
