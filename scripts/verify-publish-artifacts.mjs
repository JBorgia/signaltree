#!/usr/bin/env node
/**
 * Every glob a package DECLARES in `files` must resolve to at least one real
 * file in its dist output — checked immediately before publish.
 *
 * Why this exists: `files` is a promise about the tarball, and nothing verified
 * it. Three separate publish steps populate parts of core's declared contents,
 * and they live in different places:
 *
 *   - `dist/**\/*.js` + `src/**\/*.d.ts`  — the nx build
 *   - `skills/**\/*`                      — scripts/ship-skills.mjs, which runs
 *                                           from `npm run build:all`, NOT from
 *                                           `nx run-many -t build`
 *   - `llms.txt`, `llms-full.txt`         — copied inside the publish scripts
 *
 * so the tarball is complete only if the right combination of commands ran, in
 * the right order, from the right script. Measured on a plain
 * `nx run-many -t build --all`: core declared `llms.txt`, `llms-full.txt` and
 * `skills/**\/*` and shipped none of them — silently, because npm does not warn
 * about a `files` entry that matches nothing.
 *
 * A missing `llms.txt` is not cosmetic: it is the file that primes
 * retrieval-aware agents on a plain `npm install`, and shipping without it
 * fails quietly and invisibly.
 *
 * Usage:  node scripts/verify-publish-artifacts.mjs <pkg> [pkg...]
 *         node scripts/verify-publish-artifacts.mjs --self-test
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** Minimal glob: supports `**` and `*`, which is all `files` entries use here. */
export function globMatches(root, pattern) {
  const clean = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  // A literal path (no wildcard) is just an existence check.
  if (!clean.includes('*')) return existsSync(join(root, clean));

  const rx = new RegExp(
    '^' +
      clean
        .split('/')
        .map((seg) =>
          seg === '**' ? '.*' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
        )
        .join('/')
        .replace(/\.\*\//g, '(?:.*/)?') +
      '$'
  );

  const walk = (dir, rel = '') => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return false;
    }
    for (const e of entries) {
      const abs = join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(abs).isDirectory()) {
        if (walk(abs, r)) return true;
      } else if (rx.test(r)) {
        return true;
      }
    }
    return false;
  };
  return walk(root);
}

function selfTest() {
  console.log('🧪 verify-publish-artifacts --self-test\n');
  const root = join(process.cwd(), 'dist/packages/core');
  const cases = [
    { p: 'README.md', expect: true, name: 'literal file that exists' },
    { p: 'NOPE.md', expect: false, name: 'literal file that does not' },
    { p: 'dist/**/*.js', expect: true, name: 'recursive glob that matches' },
    { p: 'dist/**/*.nope', expect: false, name: 'recursive glob that does not' },
  ];
  let ok = true;
  for (const c of cases) {
    const got = globMatches(root, c.p);
    const pass = got === c.expect;
    if (!pass) ok = false;
    console.log(`${pass ? '✅' : '❌'} self-test: ${c.name} (${c.p})`);
  }
  if (!existsSync(root)) {
    console.log('⚠️  self-test needs dist/packages/core — build first');
    process.exit(1);
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--self-test')) selfTest();

const packages = process.argv.slice(2);
if (packages.length === 0) {
  console.error('usage: node scripts/verify-publish-artifacts.mjs <pkg> [pkg...]');
  process.exit(1);
}

console.log('📦 Verifying every declared `files` entry resolves in dist\n');
const failures = [];
let checked = 0;

for (const pkg of packages) {
  const root = join(process.cwd(), 'dist/packages', pkg);
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) {
    failures.push(`${pkg}: no dist manifest — build first`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = manifest.files || [];
  if (files.length === 0) {
    console.log(`  ${pkg.padEnd(12)} (no \`files\` declared — npm ships everything)`);
    continue;
  }
  // `!`-prefixed entries are EXCLUSIONS. They are supposed to match nothing
  // once the build is clean, so asserting they resolve is backwards — an
  // earlier revision of this gate reported all three of schema's exclusions as
  // missing artifacts.
  const positive = files.filter((f) => !f.startsWith('!'));
  const missing = positive.filter((f) => !globMatches(root, f));
  checked += positive.length;
  console.log(
    `  ${pkg.padEnd(12)} ${positive.length - missing.length}/${positive.length} entries resolve` +
      (missing.length ? `  ❌ missing: ${missing.join(', ')}` : '')
  );
  if (missing.length) failures.push(`${pkg}: ${missing.join(', ')}`);
}

if (failures.length) {
  console.error('\n❌ Declared `files` entries that match nothing:\n');
  failures.forEach((f) => console.error(`   - ${f}`));
  console.error(
    '\nnpm does NOT warn about a `files` glob that matches nothing — the tarball\n' +
      'just ships without it. If the entry is real, run the step that produces it\n' +
      '(`npm run build:all` runs ship-skills; the publish scripts copy llms.txt).\n' +
      'If it is not real, remove it from `files`.'
  );
  process.exit(1);
}

console.log(
  `\n✅ ${packages.length} package(s), ${checked} declared entries, all resolve.`
);
