#!/usr/bin/env node
/**
 * Enumerates the PUBLIC API surface of SignalTree and every competitor, read
 * from the installed `.d.ts` of the shipped package.
 *
 * ## Why read the types rather than the docs
 *
 * A capability comparison written from READMEs measures documentation, and
 * flatters whoever writes the better one. It is also the easy way to be wrong in
 * both directions: to credit a library with something its docs describe but its
 * build does not export, and to miss something it ships and never wrote up.
 * `docs/compare/capability-matrix.md` is built from this output, so every ✅ in
 * it traces to a symbol in a shipped declaration file.
 *
 * Reading the types found the defect that prompted the whole exercise: elf's
 * `StateHistory` exposes `hasPast$`/`hasFuture$` as OBSERVABLES, which raised
 * the question of whether our `canUndo()` was reactive at all. It was not.
 *
 * ## What this does NOT tell you
 *
 * Presence, not quality. A symbol in a `.d.ts` says the API exists, not that it
 * is good, fast, or documented. It also over-counts: a library exporting 199
 * symbols does not have 199 features — many are internal helpers and type
 * aliases that happen to be public. Read the counts as a shape, not a score.
 *
 * Usage:
 *   node tools/api-surface.mjs                 # all libraries
 *   node tools/api-surface.mjs --json
 *   node tools/api-surface.mjs --only=elf      # substring match on the name
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();

/**
 * Packages, not entry points — EVERY subpath in a package's exports map is
 * enumerated automatically.
 *
 * Hand-listing entry points missed `@ngrx/signals/events` and
 * `@ngrx/signals/testing` entirely, which are exactly the modules that decide
 * two rows of the matrix (action observability, testing utilities). A library's
 * own exports map is the only list that is complete by construction, and it is
 * the same rule `tools/find-dead-exports.mjs` learned the hard way when walking
 * only `src/index.ts` reported five PUBLISHED guardrails factories as dead.
 */
const PACKAGES = [
  // Ours is read from the BUILT declaration bundle, not the source barrel:
  // reading source follows re-export chains into internal modules and counted
  // 227 against @ngrx/signals' 25 — an apples-to-oranges number that would have
  // made the matrix look like a rout on surface area alone.
  { name: '@signaltree/core', dir: 'dist/packages/core' },
  { name: '@ngrx/signals', dir: 'node_modules/@ngrx/signals' },
  { name: '@ngrx/store', dir: 'node_modules/@ngrx/store' },
  { name: '@ngneat/elf', dir: 'node_modules/@ngneat/elf' },
  { name: '@ngneat/elf-entities', dir: 'node_modules/@ngneat/elf-entities' },
  { name: '@ngneat/elf-state-history', dir: 'node_modules/@ngneat/elf-state-history' },
  { name: '@ngxs/store', dir: 'node_modules/@ngxs/store' },
  { name: '@datorama/akita', dir: 'node_modules/@datorama/akita' },
];

/** Every `exports` subpath that resolves to a declaration file. */
function entryPoints(dir) {
  const base = join(ROOT, dir);
  const out = [];
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
  } catch {
    /* fall back to the guessed root entry below */
  }
  const map = manifest.exports;
  if (map && typeof map === 'object') {
    for (const [subpath, value] of Object.entries(map)) {
      if (subpath.endsWith('package.json') || subpath.includes('*')) continue;
      const declared =
        typeof value === 'string'
          ? null
          : (value.types ?? value.default?.types ?? value.import?.types);
      if (typeof declared !== 'string') continue;
      const file = join(base, declared);
      if (existsSync(file) && statSync(file).isFile()) {
        out.push({ subpath: subpath === '.' ? '' : subpath.replace(/^\./, ''), file });
      }
    }
  }
  if (!out.length) {
    const guessed = findEntry(dir);
    if (guessed) out.push({ subpath: '', file: guessed });
  }
  return out;
}

/**
 * A package's type entry — from its MANIFEST first, guessing only as a fallback.
 *
 * Guessing first got `@ngrx/store` badly wrong: it has a `types/` directory
 * holding several declaration bundles, the first of them alphabetically is the
 * TESTING one, and the tool reported @ngrx/store's public API as seven `Mock*`
 * symbols. A matrix built on that would have confidently recorded @ngrx/store as
 * lacking `Store`, `createReducer` and `createSelector` — the exact failure this
 * file's header warns about, committed by this file.
 *
 * `exports['.'].types` and `types`/`typings` are the authoritative answer.
 */
function findEntry(target) {
  const p = join(ROOT, target);
  if (target.endsWith('.ts')) return existsSync(p) ? p : null;
  if (!existsSync(p)) return null;

  try {
    const manifest = JSON.parse(readFileSync(join(p, 'package.json'), 'utf8'));
    const root = manifest.exports?.['.'];
    const declared =
      (typeof root === 'object' ? (root.types ?? root.default?.types) : null) ??
      manifest.types ??
      manifest.typings;
    if (typeof declared === 'string') {
      const f = join(p, declared);
      if (existsSync(f) && statSync(f).isFile()) return f;
    }
  } catch {
    /* fall through to the guesses */
  }

  for (const d of ['index.d.ts', 'src/index.d.ts']) {
    if (existsSync(join(p, d))) return join(p, d);
  }
  for (const sub of ['types', 'typings']) {
    const dir = join(p, sub);
    if (existsSync(dir)) {
      // Prefer a bundle named after the package over any other; never take
      // "whatever is first alphabetically".
      const files = readdirSync(dir).filter((x) => x.endsWith('.d.ts'));
      const slug = target.split('/').pop();
      const preferred =
        files.find((f) => f.replace(/\.d\.ts$/, '') === slug) ??
        files.find((f) => !/test|mock|spec/i.test(f)) ??
        files[0];
      if (preferred) return join(dir, preferred);
    }
  }
  return null;
}

/** Exported names, following RELATIVE re-exports so barrel chains are covered. */
function collect(file, seen = new Set(), out = new Set()) {
  if (!file || seen.has(file) || !existsSync(file)) return out;
  seen.add(file);

  let sf;
  try {
    sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
  } catch {
    return out;
  }

  for (const s of sf.statements) {
    const mods = ts.canHaveModifiers(s) ? (ts.getModifiers(s) ?? []) : [];
    if (mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) out.add(d.name.text);
        }
      } else if (s.name && ts.isIdentifier(s.name)) {
        out.add(s.name.text);
      }
    }
    if (ts.isExportDeclaration(s)) {
      if (s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const e of s.exportClause.elements) out.add(e.name.text);
      }
      const spec = s.moduleSpecifier?.text;
      if (spec?.startsWith('.')) {
        const base = resolve(dirname(file), spec);
        for (const c of [`${base}.d.ts`, join(base, 'index.d.ts'), `${base}.ts`, join(base, 'index.ts')]) {
          if (existsSync(c) && statSync(c).isFile()) {
            collect(c, seen, out);
            break;
          }
        }
      }
    }
  }
  return out;
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const report = {};
let missing = 0;

for (const pkg of PACKAGES) {
  if (only && !pkg.name.includes(only)) continue;
  let version = null;
  try {
    version = JSON.parse(
      readFileSync(join(ROOT, pkg.dir, 'package.json'), 'utf8')
    ).version;
  } catch {
    /* version is a nicety, not a requirement */
  }
  const entries = entryPoints(pkg.dir);
  if (!entries.length) {
    missing++;
    report[pkg.name] = { version, entries: [], count: 0, symbols: [] };
    continue;
  }
  const union = new Set();
  const perEntry = [];
  for (const e of entries) {
    const syms = [...collect(e.file)].sort();
    for (const s of syms) union.add(s);
    perEntry.push({ subpath: e.subpath || '(root)', count: syms.length });
  }
  report[pkg.name] = {
    version,
    entries: perEntry,
    count: union.size,
    symbols: [...union].sort(),
  };
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(missing ? 1 : 0);
}

for (const [name, r] of Object.entries(report)) {
  console.log(
    `\n=== ${name}${r.version ? ` @ ${r.version}` : ''} — ${r.count} unique exports` +
      (r.entries.length ? '' : '   !! NO TYPE ENTRY FOUND — this library was NOT audited')
  );
  if (r.entries.length > 1) {
    console.log(
      `    entry points: ${r.entries.map((e) => `${e.subpath}:${e.count}`).join('  ')}`
    );
  }
  if (r.symbols.length) console.log(r.symbols.join(', '));
}

console.log(
  `\n${Object.keys(report).length} libraries, ` +
    `${Object.values(report).reduce((a, r) => a + r.count, 0)} symbols. ` +
    `Presence, not quality — see the header.`
);
// A library that failed to resolve is reported as an ERROR rather than an empty
// column: silently auditing 8 of 9 libraries is how a comparison table ends up
// confidently claiming a competitor lacks a feature it ships.
if (missing) {
  console.error(`\n✗ ${missing} librar(ies) had no resolvable type entry.`);
  process.exit(1);
}
