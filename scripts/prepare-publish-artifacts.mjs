#!/usr/bin/env node
/**
 * Everything a tarball needs beyond `nx build`, in ONE place, failing loudly.
 *
 * ## The defect this replaces
 *
 * Three publish scripts each carried the same block:
 *
 *     if [ -f "apps/demo/public/llms.txt" ] && [ -d "dist/packages/core" ]; then
 *         cp apps/demo/public/llms.txt dist/packages/core/llms.txt
 *     fi
 *
 * If either path is missing, all three **silently skip it** and publish
 * `@signaltree/core` without the `llms.txt` that primes retrieval-aware agents —
 * a stated differentiator, absent, with no error anywhere. npm compounds it: a
 * `files` glob that matches nothing produces no warning at all, so the tarball
 * ships light and looks fine.
 *
 * Three copies of a conditional that can only fail quietly is the same shape as
 * every other silent-pass defect on record here. This is one copy, it is not
 * conditional, and it verifies the result rather than assuming it.
 *
 * ## What it does
 *
 *   1. ships the AI skills into every package that declares them,
 *   2. copies llms.txt / llms-full.txt into the core tarball,
 *   3. verifies every `files` entry of every package actually resolves.
 *
 * Step 3 is the point. Steps 1 and 2 could both be wrong in a new way tomorrow;
 * the verification is what notices.
 *
 * Usage:
 *   node scripts/prepare-publish-artifacts.mjs
 *   node scripts/prepare-publish-artifacts.mjs --verify-only
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY_ONLY = process.argv.includes('--verify-only');

const PACKAGES = [
  'core',
  'enterprise',
  'events',
  'guardrails',
  'ng-forms',
  'realtime',
  'schema',
  'shared',
];

/** Source → destination, relative to the repo root. Both must exist. */
const COPIES = [
  ['apps/demo/public/llms.txt', 'dist/packages/core/llms.txt'],
  ['apps/demo/public/llms-full.txt', 'dist/packages/core/llms-full.txt'],
];

function run(label, argv) {
  process.stdout.write(`  · ${label} ... `);
  try {
    execFileSync(argv[0], argv.slice(1), { cwd: ROOT, stdio: 'pipe' });
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message));
    process.exit(1);
  }
}

if (!existsSync(join(ROOT, 'dist/packages/core'))) {
  console.error(
    '✗ dist/packages/core is missing — run `npm run build:all` first.\n' +
      '  This script prepares a build; it does not produce one.'
  );
  process.exit(1);
}

if (!VERIFY_ONLY) {
  console.log('\nPreparing publish artifacts\n');

  run('ship AI skills into each package', ['node', 'scripts/ship-skills.mjs']);

  for (const [from, to] of COPIES) {
    const src = join(ROOT, from);
    // NOT conditional. A missing source is the failure this script exists to
    // surface — skipping it is how the file went missing from a tarball
    // unnoticed in the first place.
    if (!existsSync(src)) {
      console.error(
        `\n✗ ${from} does not exist.\n` +
          `  The publish scripts used to skip this silently and ship core\n` +
          `  without it. Either produce the file or remove its entry from\n` +
          `  @signaltree/core's "files" — do not restore the silent skip.`
      );
      process.exit(1);
    }
    mkdirSync(dirname(join(ROOT, to)), { recursive: true });
    copyFileSync(src, join(ROOT, to));
    console.log(`  · copied ${from} → ${to}`);
  }
}

console.log('\nVerifying every declared `files` entry resolves\n');
run('verify-publish-artifacts', [
  'node',
  'scripts/verify-publish-artifacts.mjs',
  ...PACKAGES,
]);

console.log('\n✅ Tarball contents are complete and verified.');
