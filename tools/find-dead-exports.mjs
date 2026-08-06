#!/usr/bin/env node
/**
 * Finds exported symbols that nothing imports and no barrel re-exports.
 *
 * ## The gap this fills
 *
 * `@typescript-eslint/no-unused-vars` cannot see this. It works one file at a
 * time, and an `export` is by definition a use as far as that file knows. Across
 * the whole 14.0.0 rewrite it reported exactly 4 unused symbols in non-spec
 * source, all in the demo app — which says nothing at all about whether the
 * rewrite left orphaned exports behind, because that is not a question it asks.
 *
 * A symbol is DEAD here when all three hold:
 *   1. it is exported from a file under `packages/*​/src/`;
 *   2. it is not reachable from that package's public barrel (`src/index.ts`),
 *      directly or through a chain of re-exports — the public API is *supposed*
 *      to look unused from inside;
 *   3. no other file in the repo imports it — packages, apps, tools and scripts
 *      all count, so a symbol used only by the demo or by a build script is live.
 *
 * ## What it deliberately does not flag
 *
 * - **Types used only in declaration position.** A type imported via
 *   `import type` is counted like any other import, so this is handled; but a
 *   type referenced only through a barrel's `export type *` still resolves as
 *   public API and is left alone.
 * - **Anything under a `*.spec.ts`.** Test helpers exported for a sibling spec
 *   are legitimate, and specs are where most exported-but-unimported symbols
 *   live (typing specs export named type-assertions purely to be checked).
 *
 * ## Read the output as a lead, not a verdict
 *
 * Static reachability cannot see dynamic access — a symbol reached through
 * `import()` with a computed specifier, or referenced only in a template string,
 * will look dead and is not. Every hit needs a look before deletion. What the
 * tool guarantees is the converse: anything NOT listed is definitely reachable.
 *
 * Usage:
 *   node tools/find-dead-exports.mjs           # report
 *   node tools/find-dead-exports.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['packages', 'apps', 'tools', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular', '.nx', 'tmp', '.git']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

const parse = (file) => {
  const src = readFileSync(file, 'utf8');
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
};

/** file -> Set of exported names; plus the re-export edges for barrel walking. */
const exportsByFile = new Map();
const reExports = new Map(); // file -> [{ from, names | '*' }]
const importedNames = new Set(); // every name imported anywhere
const importEdges = new Map(); // file -> [specifiers]

/** Resolve a relative specifier to a real file on disk. */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    join(base, 'index.ts'),
    `${base}.js`,
    join(base, 'index.js'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

for (const file of files) {
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  const exported = new Set();
  const res = [];
  const imps = [];

  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? (ts.getModifiers(stmt) ?? []) : [];
    const isExported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (isExported && !isDefault) {
      if (ts.isVariableStatement(stmt)) {
        for (const d of stmt.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) exported.add(d.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(stmt) ||
          ts.isClassDeclaration(stmt) ||
          ts.isInterfaceDeclaration(stmt) ||
          ts.isTypeAliasDeclaration(stmt) ||
          ts.isEnumDeclaration(stmt)) &&
        stmt.name
      ) {
        exported.add(stmt.name.text);
      }
    }

    if (ts.isExportDeclaration(stmt)) {
      const from = stmt.moduleSpecifier?.text ?? null;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        const names = stmt.exportClause.elements.map((e) => e.name.text);
        for (const n of names) exported.add(n);
        if (from) res.push({ from, names });
      } else if (from) {
        res.push({ from, names: '*' }); // export * from '...'
      }
    }

    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier) {
      imps.push(stmt.moduleSpecifier.text);
      const clause = stmt.importClause;
      if (clause?.name) importedNames.add(clause.name.text);
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            // `import { a as b }` uses `a` from the source module.
            importedNames.add((el.propertyName ?? el.name).text);
          }
        }
      }
    }
  }
  exportsByFile.set(file, exported);
  reExports.set(file, res);
  importEdges.set(file, imps);
}

// Also treat any `export { x } from './y'` as importing x from y.
for (const [file, res] of reExports) {
  for (const r of res) {
    if (r.names !== '*') for (const n of r.names) importedNames.add(n);
  }
}

/** Names reachable from a package barrel, following re-export chains. */
function publicApi(barrel) {
  const reachable = new Set();
  const seen = new Set();
  const queue = [barrel];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const n of exportsByFile.get(file) ?? []) reachable.add(n);
    for (const r of reExports.get(file) ?? []) {
      const target = resolveSpecifier(file, r.from);
      if (!target) continue;
      if (r.names === '*') queue.push(target);
      else for (const n of r.names) reachable.add(n);
    }
  }
  return reachable;
}

/**
 * EVERY entry point in the package's exports map is a public root, not just
 * `.` — core alone ships six (`./security`, `./lazy`, `./edit-session`,
 * `./storage`, `./authoring`). Walking only `src/index.ts` reported symbols as
 * dead that a consumer can import today through a subpath, which would have
 * made this tool's output actively dangerous to act on.
 *
 * The map points at built `dist/*.js`; the corresponding source barrel is the
 * same basename under `src/`.
 */
function publicRootsFor(pkg) {
  const roots = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8'));
  } catch {
    manifest = {};
  }
  for (const [subpath, value] of Object.entries(manifest.exports ?? { '.': {} })) {
    if (subpath.endsWith('package.json')) continue;
    const target =
      typeof value === 'string' ? value : (value.types ?? value.import ?? value.default);
    if (typeof target !== 'string') continue;
    // ./src/index.d.ts -> src/index.ts ; ./dist/factories/index.js ->
    // src/factories/index.ts. The FULL path matters: taking only the basename
    // mapped `./factories` to `src/index.ts` and reported all five guardrails
    // factory functions as dead when they are a published entry point.
    const base = target
      .replace(/^\.\//, '')
      .replace(/\.d\.ts$|\.js$/, '')
      .replace(/^dist\//, 'src/');
    for (const candidate of [join(ROOT, 'packages', pkg, `${base}.ts`),
                             join(ROOT, 'packages', pkg, base, 'index.ts')]) {
      try {
        if (statSync(candidate).isFile()) {
          roots.push(candidate);
          break;
        }
      } catch {
        /* next */
      }
    }
  }
  return roots;
}

const PACKAGES = readdirSync(join(ROOT, 'packages')).filter((p) => {
  try {
    return statSync(join(ROOT, 'packages', p, 'src', 'index.ts')).isFile();
  } catch {
    return false;
  }
});

const publicByPackage = new Map();
const rootCounts = new Map();
for (const p of PACKAGES) {
  const roots = publicRootsFor(p);
  rootCounts.set(p, roots.length);
  const all = new Set();
  for (const r of roots) for (const n of publicApi(r)) all.add(n);
  publicByPackage.set(p, all);
}

const dead = [];
for (const [file, exported] of exportsByFile) {
  const rel = relative(ROOT, file);
  if (!rel.startsWith('packages/')) continue;
  if (/\.spec\.|\.d\.ts$|__tests__\/|\/test-|\/testing\//.test(rel)) continue;
  if (rel.endsWith('src/index.ts')) continue;
  const pkg = rel.split('/')[1];
  const api = publicByPackage.get(pkg);
  if (!api) continue;
  for (const name of exported) {
    if (api.has(name)) continue;
    if (importedNames.has(name)) continue;
    dead.push({ file: rel, name });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(dead, null, 2));
  process.exit(0);
}

/**
 * `--self-test` proves BOTH polarities, because each has already been wrong here
 * once. Reachability was too narrow (only `src/index.ts`, so five published
 * guardrails factories looked dead) and then, after the fix, could just as
 * easily have been too broad and reported nothing ever. A checker that finds
 * nothing and a checker that is switched off are indistinguishable from output.
 */
if (process.argv.includes('--self-test')) {
  let failures = 0;
  const flagged = new Set(dead.map((d) => d.name));

  // 1. Nothing on the public API may be flagged.
  const MUST_BE_LIVE = [
    ['core', 'signalTree'],
    ['core', 'entityMap'],
    ['core', 'timeTravel'],
    ['core', 'serialization'],
    ['guardrails', 'createTestTree'],   // reachable only via the ./factories entry point
  ];
  for (const [pkg, name] of MUST_BE_LIVE) {
    const isPublic = publicByPackage.get(pkg)?.has(name);
    if (!isPublic || flagged.has(name)) {
      failures++;
      console.error(
        `  ✗ ${pkg}:${name} — public API, but ` +
          `${!isPublic ? 'not reachable from any entry point' : 'reported dead'}`
      );
    } else {
      console.log(`  ✓ ${pkg}:${name} recognised as public`);
    }
  }

  // 2. A genuinely unreachable export must be caught. `zz-` files are gitignored
  //    and eslint-ignored by design, so this leaves nothing behind.
  const probe = join(ROOT, 'packages', 'core', 'src', 'lib', 'zz-dead-export-probe.ts');
  try {
    writeFileSync(probe, 'export const zzProbeSymbolNoOneImports = 1;\n');
    const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const caught = JSON.parse(out).some((d) => d.name === 'zzProbeSymbolNoOneImports');
    if (caught) console.log('  ✓ an unreachable export is detected');
    else {
      failures++;
      console.error('  ✗ planted an unreachable export and the scan did not find it');
    }
  } finally {
    rmSync(probe, { force: true });
  }

  console.log(
    failures
      ? `\n${failures} self-test failure(s) — the scan's output cannot be trusted.`
      : `\nSelf-test passed: reachability is neither too narrow nor too broad.`
  );
  process.exit(failures ? 1 : 0);
}

const scanned = [...exportsByFile.keys()].filter((f) =>
  relative(ROOT, f).startsWith('packages/')
).length;

const totalRoots = [...rootCounts.values()].reduce((a, b) => a + b, 0);
console.log(
  `Scanned ${files.length} files (${scanned} in packages/), ` +
    `${totalRoots} public entry points across ${PACKAGES.length} packages, ` +
    `${importedNames.size} distinct imported names.`
);
console.log(
  `  entry points: ${[...rootCounts].map(([p, n]) => `${p}:${n}`).join('  ')}\n`
);

if (!dead.length) {
  console.log('No exported symbol is unreachable from both the barrels and every import.');
  process.exit(0);
}

const byFile = new Map();
for (const d of dead) {
  if (!byFile.has(d.file)) byFile.set(d.file, []);
  byFile.get(d.file).push(d.name);
}
console.log(`${dead.length} export(s) with no barrel path and no importer:\n`);
for (const [file, names] of [...byFile].sort()) {
  console.log(`  ${file}`);
  for (const n of names.sort()) console.log(`      ${n}`);
}
console.log(
  `\nLeads, not verdicts — static reachability cannot see dynamic import or ` +
    `template-string access. Confirm each before deleting.`
);
