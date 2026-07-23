#!/usr/bin/env node
/**
 * Built-barrel gate: resolution smoke test + export-parity check.
 *
 * For each publishable package:
 *  1. RESOLUTION — bundle the PUBLISHED entry (dist/index.js) with esbuild;
 *     if any internal `./…` re-export can't be resolved, the bundle fails and
 *     so does this check. Catches the class of bug that shipped in
 *     @signaltree/guardrails@10.6.0 (barrel re-exported a never-emitted file).
 *  2. EXPORT PARITY — bundle the SOURCE barrel (src/index.ts) the same way and
 *     compare the two esbuild metafile export-name sets. A built barrel that
 *     resolves but is missing (or grew) exports fails with the exact names
 *     printed. Catches the class of bug found 2026-07-23: the nx-rollup
 *     basename collision shipped stale STUB barrels for realtime/ng-forms/
 *     guardrails — they resolved fine, so the resolution-only smoke passed.
 *
 * esbuild resolves `export *` chains through relative files and elides
 * type-only exports on the TS side, so both sides yield comparable
 * runtime-export lists. Star re-exports from EXTERNAL specifiers are opaque
 * on both sides equally (none exist today in any barrel).
 *
 * Wired into: scripts/pre-publish-validation.sh (step 7b) and
 * .github/workflows/validate.yml. Exit non-zero on any failure.
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
const ROOT = new URL('..', import.meta.url).pathname;
const NM = `${ROOT}node_modules`;
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

/**
 * Bundle an entry and return its sorted runtime export names from the
 * esbuild metafile. Throws (with esbuild's message) on resolution failure.
 */
async function exportNamesOf(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    external: EXTERNAL,
    nodePaths: [NM],
    write: false,
    metafile: true,
    logLevel: 'silent',
    outdir: '/tmp/verify-barrels-out', // never written (write: false); keys the metafile
  });
  const outputs = Object.values(result.metafile.outputs);
  const entryOutput = outputs.find((o) => o.entryPoint);
  if (!entryOutput) {
    throw new Error(`esbuild metafile has no entry output for ${entry}`);
  }
  return [...entryOutput.exports].sort();
}

function firstErrorLine(e) {
  const lines = String(e.message || e).split('\n');
  return (
    lines.find((l) => /ERROR|Could not resolve/i.test(l)) || lines[0]
  ).trim();
}

let failed = 0;
for (const p of PKGS) {
  const distEntry = `${ROOT}dist/packages/${p}/dist/index.js`;
  const srcEntry = `${ROOT}packages/${p}/src/index.ts`;

  // 1. Resolution smoke on the published entry.
  let distExports;
  try {
    distExports = await exportNamesOf(distEntry);
  } catch (e) {
    failed++;
    console.error(`✗ ${p} — built barrel failed to resolve: ${firstErrorLine(e)}`);
    continue;
  }

  // 2. Export parity against the source barrel.
  let srcExports;
  try {
    srcExports = await exportNamesOf(srcEntry);
  } catch (e) {
    failed++;
    console.error(`✗ ${p} — source barrel failed to bundle (parity check impossible): ${firstErrorLine(e)}`);
    continue;
  }

  const distSet = new Set(distExports);
  const srcSet = new Set(srcExports);
  const missing = srcExports.filter((n) => !distSet.has(n));
  const extra = distExports.filter((n) => !srcSet.has(n));

  if (missing.length || extra.length) {
    failed++;
    console.error(`✗ ${p} — built barrel exports diverge from source barrel:`);
    if (missing.length)
      console.error(`    missing from dist: ${missing.join(', ')}`);
    if (extra.length)
      console.error(`    extra in dist:     ${extra.join(', ')}`);
  } else {
    console.log(`✓ ${p} — barrel resolves, ${distExports.length} exports match source`);
  }
}

if (failed) {
  console.error(
    `\n${failed} package barrel(s) failed. A published package would be broken or incomplete.`
  );
  process.exit(1);
}
console.log(`\nAll ${PKGS.length} package barrels resolve and match their source exports.`);
