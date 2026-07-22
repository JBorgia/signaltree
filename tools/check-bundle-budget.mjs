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
    budgetKB: 5.8,
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
    // minified (~1.1KB gzip) of that. RFC 0003 deliberately traded this
    // floor for the one-marker DX; statically tree-shaking a config-driven
    // branch is impossible, and a sync-stub + dynamic-import split of the
    // loader is the only way to win it back — worth its own RFC if the
    // floor ever matters more than the DX. Accepted for now.
    budgetKB: 9.9,
    code: `
      import { signalTree, entityMap } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, users: entityMap() });
      t.$.users.addOne({ id: 1, name: 'a' }); t.$.users.updateOne(1, { name: 'b' });
      globalThis.__sink = t.$.users.all();
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
