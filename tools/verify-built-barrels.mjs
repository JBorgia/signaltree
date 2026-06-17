#!/usr/bin/env node
/**
 * Built-barrel smoke test. For each publishable package, bundle its PUBLISHED
 * entry (dist/index.js) with esbuild — if any internal `./…` re-export can't be
 * resolved, the bundle fails and so does this check.
 *
 * Catches the class of bug that shipped in @signaltree/guardrails@10.6.0: the
 * barrel did `export * from './lib/rules.js'` but rules.js was never emitted,
 * so importing the package threw "Cannot find module" — invisible to source
 * tests, the .d.ts gate, and lint. Wire into prepublish so it can never recur.
 *
 * Exit non-zero if any package barrel fails to resolve.
 */
import { build } from 'esbuild';

const PKGS = [
  'core',
  'enterprise',
  'events',
  'ng-forms',
  'realtime',
  'schema',
  'guardrails',
  'callable-syntax',
];
const NM = new URL('../node_modules', import.meta.url).pathname;
// Externalize ambient peers + sibling @signaltree packages + heavy build-time deps.
const EXTERNAL = [
  '@angular/*',
  'rxjs',
  'rxjs/*',
  'tslib',
  '@signaltree/*',
  'zod',
  'valibot',
  '@standard-schema/*',
  '@babel/*',
  'estree-walker',
  'magic-string',
];

let failed = 0;
for (const p of PKGS) {
  const entry = new URL(`../dist/packages/${p}/dist/index.js`, import.meta.url)
    .pathname;
  try {
    await build({
      stdin: {
        contents: `export * from ${JSON.stringify(entry)};`,
        resolveDir: '.',
        loader: 'js',
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      external: EXTERNAL,
      nodePaths: [NM],
      write: false,
      logLevel: 'silent',
    });
    console.log(`✓ ${p} — barrel resolves`);
  } catch (e) {
    failed++;
    const msg = String(e.message || e)
      .split('\n')
      .find((l) => /ERROR|Could not resolve/i.test(l)) || String(e.message || e).split('\n')[0];
    console.error(`✗ ${p} — ${msg.trim()}`);
  }
}

if (failed) {
  console.error(`\n${failed} package barrel(s) failed to resolve. A published package would be broken.`);
  process.exit(1);
}
console.log(`\nAll ${PKGS.length} package barrels resolve.`);
