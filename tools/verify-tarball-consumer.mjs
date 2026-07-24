#!/usr/bin/env node
/**
 * Tarball-consumer gate.
 *
 * The barrel / dist / export-parity gates all inspect the `dist/` folder. This
 * one inspects what `npm pack` ACTUALLY ships and whether a real external
 * consumer can install + resolve it — the last gap the release-process audit
 * flagged (RFC 0004). Two parts:
 *
 *   A. Pack every publishable package, extract the tarball, and assert every
 *      target its `exports` map references is actually present in the shipped
 *      files. Catches "exports points at a file the `files` field didn't
 *      include" (the guardrails@10.6 barrel bug class) and the v12 subpath
 *      moves (e.g. `/authoring`) shipping their JS + d.ts.
 *   B. For `@signaltree/core` (the flagship; no workspace deps so it installs
 *      cleanly), `npm install` the tarball into a throwaway consumer and
 *      `require.resolve()` every documented subpath — proving Node's resolver +
 *      a real install accept the published `exports` end-to-end. `--legacy-peer-
 *      deps` skips the heavy @angular/rxjs peer install (we test resolution,
 *      not execution).
 *
 * Usage:
 *   node tools/verify-tarball-consumer.mjs              # needs dist/packages/* (build first)
 *   node tools/verify-tarball-consumer.mjs --self-test  # prove the gate can fail
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'packages');
const PACKAGES = [
  'core',
  'callable-syntax',
  'enterprise',
  'guardrails',
  'ng-forms',
  'realtime',
  'schema',
  'events',
  'shared',
];

const errors = [];
const info = [];

/** Collect the relative-path string targets a package.json `exports` map points at. */
function exportTargets(exportsField) {
  const targets = [];
  const visit = (v) => {
    if (typeof v === 'string') {
      if (v.startsWith('./')) targets.push(v);
    } else if (v && typeof v === 'object') {
      for (const val of Object.values(v)) visit(val);
    }
  };
  visit(exportsField);
  return [...new Set(targets)];
}

function pack(pkgDistDir, dest) {
  mkdirSync(dest, { recursive: true });
  const out = execFileSync(
    'npm',
    ['pack', pkgDistDir, '--pack-destination', dest, '--json'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const meta = JSON.parse(out);
  return join(dest, meta[0].filename);
}

function extract(tgz, dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', dest], { stdio: 'ignore' });
  return join(dest, 'package'); // npm tarballs root everything under package/
}

// --- Part A: every packed package ships the files its exports reference ------
function checkPackedExports(pkg, tmp) {
  const distDir = join(DIST, pkg);
  const distManifestPath = join(distDir, 'package.json');
  if (!existsSync(distManifestPath)) {
    errors.push(`${pkg}: no built dist at ${distDir} — run the build first.`);
    return;
  }
  // Private packages are workspace-internal — never published, so their
  // tarball packaging is irrelevant (they may legitimately point exports at
  // raw ./src for in-repo consumption).
  if (JSON.parse(readFileSync(distManifestPath, 'utf8')).private === true) {
    info.push(`${pkg}: private (workspace-internal) — skipped`);
    return;
  }
  let tgz;
  try {
    tgz = pack(distDir, join(tmp, 'tgz'));
  } catch (e) {
    errors.push(`${pkg}: npm pack failed — ${String(e).split('\n')[0]}`);
    return;
  }
  const pkgRoot = extract(tgz, join(tmp, 'x', pkg));
  const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  const targets = exportTargets(manifest.exports);
  if (targets.length === 0) {
    info.push(`${pkg}: no exports subpaths (ok)`);
    return;
  }
  const missing = targets.filter((t) => !existsSync(join(pkgRoot, t)));
  if (missing.length) {
    errors.push(
      `${pkg}: exports references file(s) NOT shipped in the tarball: ${missing.join(
        ', '
      )} (check the "files" field)`
    );
  } else {
    info.push(`${pkg}: ${targets.length} exports target(s) all shipped ✓`);
  }
  return tgz;
}

// --- Part B: core installs into a real consumer and resolves every subpath ---
function checkCoreConsumerResolves(coreTgz, tmp) {
  if (!coreTgz) {
    errors.push('core: tarball not produced — cannot run consumer resolve.');
    return;
  }
  const consumer = join(tmp, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify(
      { name: 'st-tarball-consumer', private: true, version: '0.0.0', dependencies: { '@signaltree/core': `file:${coreTgz}` } },
      null,
      2
    )
  );
  try {
    execFileSync(
      'npm',
      ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--no-package-lock'],
      { cwd: consumer, stdio: 'ignore' }
    );
  } catch (e) {
    errors.push(`core consumer: npm install of the tarball failed — ${String(e).split('\n')[0]}`);
    return;
  }
  const req = createRequire(join(consumer, 'index.js'));
  const subpaths = ['@signaltree/core', '@signaltree/core/authoring', '@signaltree/core/security', '@signaltree/core/lazy', '@signaltree/core/edit-session', '@signaltree/core/storage'];
  for (const sp of subpaths) {
    try {
      req.resolve(sp);
      info.push(`core consumer: resolved ${sp} ✓`);
    } catch {
      errors.push(`core consumer: could NOT resolve '${sp}' from an installed tarball — exports/files broken.`);
    }
  }
}

// --- self-test: prove the gate fails on a broken exports target --------------
if (process.argv.includes('--self-test')) {
  const tmp = mkdtempSync(join(tmpdir(), 'st-tarball-selftest-'));
  const fakePkg = join(tmp, 'pkg');
  mkdirSync(join(fakePkg, 'dist'), { recursive: true });
  writeFileSync(join(fakePkg, 'dist', 'index.js'), 'export {};');
  writeFileSync(
    join(fakePkg, 'package.json'),
    JSON.stringify({
      name: '@signaltree/fake',
      version: '0.0.0',
      files: ['dist'],
      exports: { '.': './dist/index.js', './missing': './dist/nope.js' },
    })
  );
  const tgz = pack(fakePkg, join(tmp, 'tgz'));
  const root = extract(tgz, join(tmp, 'x'));
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const missing = exportTargets(manifest.exports).filter((t) => !existsSync(join(root, t)));
  if (missing.length === 1 && missing[0] === './dist/nope.js') {
    console.log('✅ self-test: gate detects an exports target missing from the tarball');
    process.exit(0);
  }
  console.error('❌ self-test FAILED: gate did not detect the missing target');
  process.exit(1);
}

// --- run ---------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'st-tarball-'));
let coreTgz;
for (const pkg of PACKAGES) {
  const tgz = checkPackedExports(pkg, tmp);
  if (pkg === 'core') coreTgz = tgz;
}
checkCoreConsumerResolves(coreTgz, tmp);

for (const line of info) console.log('  ' + line);
if (errors.length) {
  console.error('\n❌ Tarball-consumer gate failed:');
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}
console.log('\n✅ Tarball-consumer gate passed: every packed exports target ships, and @signaltree/core resolves from a real install.');
