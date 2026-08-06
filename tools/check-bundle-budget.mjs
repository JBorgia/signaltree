#!/usr/bin/env node
/**
 * Bundle-budget gate. Re-measures SignalTree's own gzip cost (via
 * tools/measure-bundle-sizes.mjs' methodology) and fails if it regresses past
 * the budgets below. Exists because the floor previously inflated silently:
 * statically-reachable optional modules (SecurityValidator, memory-manager)
 * leaked into every bundle. After the v11 security + lazy injections the bare
 * floor is ~5.3KB / with-entityMap ~8.1KB gzip; these budgets lock that in with
 * headroom.
 *
 * Budgets are gzip KB, own-code only (@angular/rxjs/tslib external). Bump them
 * deliberately in a commit if a real feature justifies it — never silently.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CORE = new URL('../dist/packages/core/dist/index.js', import.meta.url)
  .pathname;
const REPO_NODE_MODULES = new URL('../node_modules', import.meta.url).pathname;

// id -> { code, budgetKB }
const TARGETS = {
  'signaltree-bare': {
    // Bumped 5.8 → 6.9 for 13.5.0. Measured 6.81KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.
    budgetKB: 6.9,
    code: `
      import { signalTree } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, user: { name: 'a' } });
      t.$.count.set(1); t.$.user.name.set('b');
      globalThis.__sink = [t.$.count(), t.$.user.name()];
    `,
  },
  'signaltree-entities': {
    // Bumped 8.6 → 9.9 for 11.4.1: the 11.4.0 entityMap cache-aware fold
    // (load/staleTime/persist/tags, RFC 0003) raised the measured floor to
    // 9.67KB and shipped that way — the gate was not updated with the
    // feature. Measured breakdown (11.5.0): entity-loader.js is ~3.5KB
    // minified (~1.1KB gzip) of that.
    //
    // Lowered 9.9 → 8.6 for 12.0.0 (RFC 0005 §6): the reclaim landed. v12
    // removed the raw `load: fn` path and entity-map.ts's static `attachLoader`
    // import, so the loader/cache/SWR/persist machinery is reached ONLY through
    // the `loader()` helper. A plain `entityMap()` (measured here) now
    // tree-shakes it out entirely — measured 8.36KB gzip, down from 9.89KB in
    // the 11.6 dual-path interim (~1.53KB reclaimed). Cache-aware collections
    // pay for the machinery via `loader()`; plain collections do not. This
    // budget locks the win in — a regression back toward 9.9 means something
    // re-introduced a static reference to the loader machinery on the plain path.
    //
    // Bumped 8.6 → 8.7 for 13.4.0: the traversal diagnostics (ST2008-ST2011)
    // added in that release live in recursiveUpdate/unwrap/applyState — paths
    // EVERY tree reaches, so they cannot tree-shake for a consumer who never
    // triggers them. Measured 8.66KB; +0.06KB of guarded message strings, not
    // a leaked optional module. Defining `ngDevMode: false` removes them
    // entirely (see docs/performance/dropping-dev-code.md, which measures
    // ~1.15KB reclaimed for this scenario). Deliberate, not a regression.
    //
    // Bumped 8.7 → 9.8 for 13.5.0. Measured 9.71KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.
    budgetKB: 9.8,
    code: `
      import { signalTree, entityMap } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, users: entityMap() });
      t.$.users.addOne({ id: 1, name: 'a' }); t.$.users.updateOne(1, { name: 'b' });
      globalThis.__sink = t.$.users.all();
    `,
  },
  'signaltree-form': {
    // v13 (RFC 0007): the form() marker WITHOUT history(). The history engine
    // (snapshot buffer + undo/redo) is an injected feature carried only by the
    // history() helper's closure, so a plain form() tree-shakes it out —
    // measured 7.46KB gzip. A regression toward 8.2KB means a static reference
    // to the history engine leaked onto the plain form() path. The
    // forbidden-identifier assertion in scripts/verify-tree-shaking.js is the
    // companion structural check.
    //
    // Bumped 7.8 → 7.9 for 13.4.0: same cause as signaltree-entities — the
    // ST2008-ST2011 traversal diagnostics sit on paths every tree reaches.
    // Measured 7.86KB. Not a history-engine leak; the forbidden-identifier
    // check in scripts/verify-tree-shaking.js still guards that.
    //
    // Bumped 7.9 → 9.0 for 13.5.0. Measured 8.90KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.
    budgetKB: 9.0,
    code: `
      import { signalTree, form } from ${JSON.stringify(CORE)};
      const t = signalTree({ p: form({ initial: { name: '', email: '' } }) });
      t.$.p.patch({ name: 'a' });
      globalThis.__sink = t.$.p();
    `,
  },
};

const EXTERNAL = ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'];
const dir = mkdtempSync(join(tmpdir(), 'st-budget-'));
let failed = false;

for (const [id, { code, budgetKB }] of Object.entries(TARGETS)) {
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
    nodePaths: [REPO_NODE_MODULES],
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const gz = gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 });
  const kb = gz.length / 1024;
  const ok = kb <= budgetKB;
  if (!ok) failed = true;
  console.log(
    `${ok ? '✅' : '❌'} ${id.padEnd(22)} ${kb.toFixed(2)}KB gzip (budget ${budgetKB}KB)`
  );
}

if (failed) {
  console.error(
    '\n❌ Bundle budget exceeded. A regression inflated the floor — find the ' +
      'statically-reachable optional module and make it tree-shakeable (subpath ' +
      'or injected feature), or bump the budget deliberately with justification.'
  );
  process.exit(1);
}
console.log('\n✅ Bundle within budget.');
