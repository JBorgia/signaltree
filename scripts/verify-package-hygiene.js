#!/usr/bin/env node

/**
 * Package-hygiene verification
 * ============================
 *
 * Checks what actually MATTERS about a published tarball — not a hand-synced
 * byte count (a rubber stamp), but: does the package ship exactly what it
 * should, and no junk?
 *
 * For each publishable package it inspects the REAL packed file list
 * (`npm pack --dry-run --json`, which respects `files`/`.npmignore` — unlike a
 * dist-dir walk) and asserts:
 *   1. NO forbidden files leaked in — test specs, source maps, raw `.ts`
 *      source (libraries ship `.js` + `.d.ts`, not `.ts`), tsconfig/tsbuildinfo,
 *      test configs, fixtures, `node_modules`. This is the accident this gate
 *      exists to catch (a mis-scoped `files` glob shipping the world).
 *   2. Required entries ARE present — `package.json`, the `main`/`module`
 *      entry, at least one `.d.ts`, and every `exports` subpath target.
 *
 * Run: node scripts/verify-package-hygiene.js
 *      node scripts/verify-package-hygiene.js --self-test
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Keep aligned with scripts/release.sh / ci-publish.sh PACKAGES.
const PACKAGES = [
  'core',
  'events',
  'ng-forms',
  'realtime',
  'callable-syntax',
  'enterprise',
  'guardrails',
  'schema',
];

/** Files that must NEVER appear in a published tarball. */
const FORBIDDEN = [
  { re: /\.spec\./, why: 'test spec' },
  { re: /\.test\./, why: 'test file' },
  { re: /\.map$/, why: 'source map' },
  { re: /(?<!\.d)\.ts$/, why: 'raw .ts source (ship .js + .d.ts, not .ts)' },
  { re: /tsconfig.*\.json$/, why: 'tsconfig' },
  { re: /\.tsbuildinfo$/, why: 'tsbuildinfo' },
  { re: /(?:^|\/)(?:jest|karma|vitest)\.config\./, why: 'test config' },
  { re: /(?:^|\/)__tests__\//, why: '__tests__ dir' },
  { re: /(?:^|\/)node_modules\//, why: 'node_modules' },
  { re: /(?:^|\/)(?:fixtures?|__mocks__)\//, why: 'test fixtures/mocks' },
];

/** Read the real packed file list for a built package. */
function packedFiles(distDir) {
  const out = execSync('npm pack --dry-run --json', {
    cwd: distDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, '/'));
}

/** Assert forbidden-absent + required-present for one package's file list. */
function checkPackage(files, distDir) {
  const violations = [];

  for (const f of files) {
    for (const { re, why } of FORBIDDEN) {
      if (re.test(f)) violations.push(`ships forbidden ${why}: ${f}`);
    }
  }

  const has = (p) => files.includes(p);
  if (!has('package.json')) violations.push('missing package.json');

  const pkg = JSON.parse(
    fs.readFileSync(path.join(distDir, 'package.json'), 'utf8')
  );
  const main = (pkg.module || pkg.main || '').replace(/^\.\//, '');
  if (main && !has(main)) violations.push(`main/module entry not packed: ${main}`);
  if (!files.some((f) => f.endsWith('.d.ts')))
    violations.push('no .d.ts types packed');

  // Every exports subpath target must be in the tarball.
  for (const [sub, cond] of Object.entries(pkg.exports || {})) {
    const targets =
      typeof cond === 'string'
        ? [cond]
        : Object.values(cond).filter((v) => typeof v === 'string');
    for (const t of targets) {
      const rel = t.replace(/^\.\//, '');
      if (rel && !has(rel))
        violations.push(`exports "${sub}" target not packed: ${rel}`);
    }
  }

  return violations;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  console.log('🧼 Package-hygiene verification (real packed contents)\n');
  let failed = false;

  for (const name of PACKAGES) {
    const distDir = path.join(process.cwd(), 'dist/packages', name);
    if (!fs.existsSync(path.join(distDir, 'package.json'))) {
      console.log(`⚠️  ${name}: no dist output (build first) — skipping`);
      continue;
    }
    let files;
    try {
      files = packedFiles(distDir);
    } catch (e) {
      console.log(`❌ ${name}: npm pack failed — ${e.message.split('\n')[0]}`);
      failed = true;
      continue;
    }
    const violations = checkPackage(files, distDir);
    if (violations.length) {
      console.log(`❌ ${name} (${files.length} files):`);
      violations.forEach((v) => console.log(`   - ${v}`));
      failed = true;
    } else {
      console.log(`✅ ${name} (${files.length} files) — clean`);
    }
  }

  if (failed) {
    console.log('\n❌ PACKAGE-HYGIENE VERIFICATION FAILED');
    console.log('A publishable tarball ships junk or is missing an entry.');
    console.log('Fix the package `files`/exports (or the build) — not this gate.');
    process.exit(1);
  }
  console.log('\n✅ All packages ship clean tarballs with their declared entries');
  process.exit(0);
}

/** Negative test (RFC 0004 §5 rule 2): the gate must be able to fail. */
function selfTest() {
  console.log('🧪 verify-package-hygiene --self-test\n');
  let failed = 0;
  const expect = (label, cond) => {
    console.log(`  ${cond ? '✅' : '❌'} ${label}`);
    if (!cond) failed++;
  };

  const dirty = [
    'package.json',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/lib/foo.spec.js', // forbidden
    'dist/index.js.map', // forbidden
    'src/lib/foo.ts', // forbidden raw .ts
  ];
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hyg-'));
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ main: './dist/index.js', exports: {} })
  );
  const v = checkPackage(dirty, tmp);
  expect('flags a .spec file', v.some((x) => x.includes('.spec')));
  expect('flags a source map', v.some((x) => x.includes('source map')));
  expect('flags raw .ts source', v.some((x) => x.includes('raw .ts')));

  const clean = ['package.json', 'dist/index.js', 'dist/index.d.ts'];
  expect('passes a clean package', checkPackage(clean, tmp).length === 0);
  expect('keeps .d.ts (not flagged as raw .ts)', !checkPackage(clean, tmp).some((x) => x.includes('raw .ts')));

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) {
    console.error(`\n❌ SELF-TEST FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\n✅ Self-test passed — gate demonstrably able to fail');
  process.exit(0);
}

main();
