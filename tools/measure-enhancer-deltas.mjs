#!/usr/bin/env node
/**
 * Measure what each enhancer actually ADDS to a production bundle, so the
 * per-enhancer numbers in the README are derived rather than remembered.
 *
 * Three of the four figures in `packages/core/README.md` were wrong when this
 * was written, and the errors ran in both directions:
 *
 *     enhancer         claimed    measured (prod main bundle)
 *     batching         +1.27 KB   +0.98 KB
 *     devTools         +2.49 KB   +0.10 KB  (impl is LAZY — 8.25 KB chunk)
 *     timeTravel       +1.75 KB   +1.68 KB  ✓
 *     serialization    +0.84 KB   +1.85 KB  ← understated by 2.2x
 *
 * `serialization` is the one that matters: understating a cost is the direction
 * that misleads someone making a budget decision. `devTools` was wrong the other
 * way — the figure appears to be the implementation's own size, which is real
 * but is NOT what a consumer's main bundle pays, because the implementation is
 * behind a dynamic import.
 *
 * Everything here is measured with `ngDevMode: false` — the production build,
 * which is what a consumer ships. The same code measured in dev mode is ~1.8 KB
 * larger per tree, so quoting a number without its condition invites someone to
 * measure their dev build and conclude the docs lie.
 *
 * Usage: node tools/measure-enhancer-deltas.mjs [--json]
 *        (requires `nx run-many -t build --all` first)
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
const NODE_MODULES = join(process.cwd(), 'node_modules');
const EXTERNAL = ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'];

if (!existsSync(CORE)) {
  console.error(`❌ ${CORE} not found — run \`nx run-many -t build --all\` first.`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'st-enh-'));

async function gzipKB(code, id) {
  const entry = join(dir, `${id}.js`);
  writeFileSync(entry, code, 'utf8');
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    treeShaking: true,
    external: EXTERNAL,
    nodePaths: [NODE_MODULES],
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
    define: { ngDevMode: 'false' },
  });
  return (
    gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length / 1024
  );
}

const BASE = `
  import { signalTree } from ${JSON.stringify(CORE)};
  const t = signalTree({ count: 0, user: { name: 'a' } });
  t.$.count.set(1);
  globalThis.__sink = [t.$.count()];
`;

/**
 * `use` must EXERCISE the enhancer, not merely apply it. Measuring
 * `.with(x())` alone understates anything whose surface is only reachable
 * through a method call, and overstates nothing — so exercising is strictly
 * the safer default.
 */
const ENHANCERS = [
  { name: 'batching', imports: 'batching', apply: 'batching()', use: 't.batch(() => t.$.count.set(2));' },
  { name: 'timeTravel', imports: 'timeTravel', apply: 'timeTravel()', use: 't.undo(); t.redo();' },
  { name: 'serialization', imports: 'serialization', apply: 'serialization()', use: 'globalThis.__s = t.serialize();' },
  { name: 'devTools', imports: 'devTools', apply: 'devTools()', use: 't.connectDevTools();' },
];

const base = await gzipKB(BASE, 'base');
const rows = [];

for (const e of ENHANCERS) {
  const code = `
    import { signalTree, ${e.imports} } from ${JSON.stringify(CORE)};
    const t = signalTree({ count: 0, user: { name: 'a' } }).with(${e.apply});
    t.$.count.set(1);
    ${e.use}
    globalThis.__sink = [t.$.count()];
  `;
  const total = await gzipKB(code, e.name);
  rows.push({ enhancer: e.name, totalKB: +total.toFixed(2), deltaKB: +(total - base).toFixed(2) });
}

// A lazily-loaded implementation is a real cost, just not a main-bundle one.
const lazyChunks = [
  ['devtools-impl', 'dist/packages/core/dist/enhancers/devtools/devtools-impl.js'],
]
  .filter(([, p]) => existsSync(join(process.cwd(), p)))
  .map(([name, p]) => ({
    chunk: name,
    gzipKB: +(
      gzipSync(readFileSync(join(process.cwd(), p)), { level: 9 }).length / 1024
    ).toFixed(2),
  }));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ baseKB: +base.toFixed(2), rows, lazyChunks }, null, 2));
} else {
  console.log('Production bundle (ngDevMode: false), own code only, gzipped\n');
  console.log(`  bare signalTree            ${base.toFixed(2)} KB`);
  for (const r of rows) {
    console.log(
      `  + ${r.enhancer.padEnd(15)} ${r.totalKB.toFixed(2)} KB   delta +${r.deltaKB.toFixed(2)} KB`
    );
  }
  if (lazyChunks.length) {
    console.log('\nLazily loaded — NOT in the main bundle, fetched on first use:');
    for (const c of lazyChunks) console.log(`  ${c.chunk.padEnd(17)} ${c.gzipKB} KB`);
  }
  console.log(
    '\nQuote these WITH their condition. The same code in a dev build is ~1.8 KB\nlarger per tree; a number without its condition reads as a lie to anyone who\nmeasures the other one.'
  );
}
