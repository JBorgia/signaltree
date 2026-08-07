#!/usr/bin/env node
/**
 * Release-delta claim coverage: every capability this release ADDS must appear
 * on every surface that claims to describe the library.
 *
 * ## Why this exists
 *
 * Every other gate in this repo is a NO-DANGLING-REFERENCE check. `readme-apis`
 * asserts that a symbol a README names exists; `lint-skills` does it for skill
 * code blocks; `taught-symbols` does it for `llms-full.txt`. They all run in one
 * direction: claim -> API.
 *
 * The opposite direction was unguarded, and it is not symmetric. **A "we don't
 * have X" is a claim about ABSENCE, and you cannot grep for a symbol that is not
 * mentioned.** So thirty gates were structurally blind to it.
 *
 * What that cost, twice, in one release:
 *
 *   - `49dd9ffb` — "the AI-priming surfaces taught NONE of 14.0.0". `llms.txt`,
 *     `llms-full.txt`, the core README and the skill scored ZERO on prependOne,
 *     activeEntity, setActiveId, changeId, pauseRecording, shouldSkip,
 *     onTreeError, ST2025 and ST2026. Found by hand.
 *   - `docs/compare/capability-matrix.md` still carried ❌ for FIVE capabilities
 *     the same release shipped, and was edited twice AFTER they landed. It was
 *     not in `49dd9ffb`'s hand-written surface list.
 *
 * Both are the same bug, and the second one proves the fix has to be structural:
 * a hand-maintained list of surfaces will miss a surface, and a hand-maintained
 * list of symbols will miss a symbol. **This derives both from the repo.**
 * Symbols come from a git diff of the published barrels; surfaces are declared
 * once below and each new one is swept automatically from then on.
 *
 * Note also what the git history does NOT give you: the matrix was edited after
 * the features shipped, so "flag docs nothing has touched in a while" would have
 * reported it as fresh. Age tracks staleness badly. Coverage tracks it exactly.
 *
 * ## What counts as covered
 *
 * A symbol is covered by a surface if its name appears in that surface's text.
 * That is deliberately weak — it proves the surface MENTIONS the capability, not
 * that it explains it well. A weak check that runs on every release beats a
 * strong one that runs when somebody remembers.
 *
 * Usage:
 *   node tools/check-release-claims.mjs                  # gate, exits 1 on a gap
 *   node tools/check-release-claims.mjs --base=v13.4.0   # diff from another tag
 *   node tools/check-release-claims.mjs --list           # show the delta, exit 0
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const LIST_ONLY = process.argv.includes('--list');

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** File content at a revision, or null when the file did not exist there. */
function showAt(rev, relPath) {
  try {
    return execFileSync('git', ['show', `${rev}:${relPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * The release to diff against: the newest version tag that is NOT the version
 * currently in package.json. Derived rather than pinned, so this keeps working
 * across releases without anyone editing it.
 */
function resolveBase() {
  const explicit = process.argv.find((a) => a.startsWith('--base='));
  if (explicit) return explicit.slice(7);
  const current = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8')
  ).version;
  const tags = git('tag', '--sort=-v:refname')
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+/.test(t));
  const base = tags.find((t) => t !== `v${current}`);
  if (!base) {
    console.error('No prior version tag found to diff against.');
    process.exit(1);
  }
  return base;
}

/** Published barrel SOURCES for a package, derived from its exports map. */
function barrelsFor(pkgDir) {
  const pkgJson = join(pkgDir, 'package.json');
  if (!existsSync(pkgJson)) return [];
  const { exports: map } = JSON.parse(readFileSync(pkgJson, 'utf8'));
  if (!map) return [];
  const out = new Set();
  for (const entry of Object.values(map)) {
    const types = typeof entry === 'object' ? entry?.types : entry;
    if (typeof types !== 'string' || !types.endsWith('.d.ts')) continue;
    // ./src/index.d.ts -> <pkg>/src/index.ts
    const src = join(pkgDir, types.replace(/\.d\.ts$/, '.ts'));
    out.add(relative(ROOT, src));
  }
  return [...out];
}

/**
 * Exported names from one barrel at one revision, following `export *` into the
 * modules behind it. Named re-exports publish exactly the names they list, so
 * those are NOT followed — the same rule `api-surface.mjs` learned after
 * counting our internals against competitors' public APIs.
 */
function symbolsAt(rev, relPath, seen = new Set(), out = new Map(), depth = 0) {
  if (depth > 6 || seen.has(relPath)) return out;
  seen.add(relPath);
  const text = showAt(rev, relPath);
  if (text == null) return out;

  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true);

  const resolveSpecifier = (spec) => {
    const base = join(dirname(relPath), spec);
    for (const cand of [`${base}.ts`, join(base, 'index.ts')]) {
      const norm = relative(ROOT, resolve(ROOT, cand));
      if (showAt(rev, norm) != null) return norm;
    }
    return null;
  };

  const pkg = relPath.split('/')[1] ?? 'unknown';
  const note = (name, kind) => {
    // A name re-exported as a value anywhere wins: `export type { X }` in one
    // barrel and `export function X` in another must not downgrade to a type.
    if (kind === 'value' || !out.has(name)) out.set(name, { kind, pkg });
  };

  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          note(el.name.text, st.isTypeOnly || el.isTypeOnly ? 'type' : 'value');
        }
      } else if (!st.exportClause && st.moduleSpecifier) {
        const next = resolveSpecifier(st.moduleSpecifier.text);
        if (next) symbolsAt(rev, next, seen, out, depth + 1);
      }
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const isType =
      ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) note(d.name.text, 'value');
      }
    } else if (st.name && ts.isIdentifier(st.name)) {
      note(st.name.text, isType ? 'type' : 'value');
    }
  }
  return out;
}

/**
 * Members of the PUBLIC interfaces, at a revision.
 *
 * Barrel exports alone are not the capability surface, and assuming they were
 * made the first version of this gate BLIND to the exact failure it was written
 * for: `prependOne`, `activeEntity`, `setActiveId`, `changeId`,
 * `pauseRecording` and `shouldSkip` are all METHODS on `EntitySignal` /
 * `TimeTravelMethods` / `TimeTravelConfig`. Not one is an exported symbol, so
 * not one appeared in the diff — the gate passed while its own target was
 * broken, and `--self-test` said so.
 *
 * So: resolve which exported names are interfaces, then diff their members too.
 */
function membersAt(rev, exportedNames) {
  const files = git('ls-tree', '-r', '--name-only', rev, 'packages/')
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
  const members = new Map();
  for (const f of files) {
    const text = showAt(rev, f);
    if (!text || !text.includes('export interface')) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const pkg = f.split('/')[1] ?? 'unknown';
    for (const st of sf.statements) {
      if (!ts.isInterfaceDeclaration(st)) continue;
      const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
      if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (!exportedNames.has(st.name.text)) continue;
      for (const m of st.members) {
        if (!m.name || !ts.isIdentifier(m.name)) continue;
        // `__`-prefixed members are internal plumbing by convention.
        if (m.name.text.startsWith('__')) continue;
        if (!members.has(m.name.text)) {
          members.set(m.name.text, { kind: 'member', pkg, on: st.name.text });
        }
      }
    }
  }
  return members;
}

/** Diagnostic codes present in package sources at a revision. */
function codesAt(rev) {
  const files = git('ls-tree', '-r', '--name-only', rev, 'packages/')
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
  const codes = new Set();
  for (const f of files) {
    const text = showAt(rev, f);
    if (!text) continue;
    for (const m of text.matchAll(/\[(ST\d{4})\]/g)) codes.add(m[1]);
  }
  return codes;
}

/**
 * The surfaces that CLAIM to describe the library. Adding one here puts it in
 * the sweep permanently — which is the whole point, since the failure that
 * prompted this gate was a surface missing from a hand-written list.
 *
 * `applies` keeps each surface honest about its own job: the error registry
 * indexes diagnostic codes and should not be failed for missing a type alias;
 * the demo demonstrates runtime API and should not be failed for a type either.
 */
const SURFACES = [
  {
    name: 'llms.txt',
    files: ['apps/demo/public/llms.txt'],
    // The priming file an agent retrieves. It teaches the API you CALL, so a
    // type alias is out of scope and a new callable is squarely in it.
    applies: (r) =>
      !r.isCode &&
      (r.kind === 'value' || r.kind === 'member') &&
      r.pkg === 'core',
  },
  {
    name: 'llms-full.txt',
    files: ['apps/demo/public/llms-full.txt'],
    // The long form teaches diagnostics too — an agent that can name the code
    // can explain the warning the user is staring at.
    applies: (r) =>
      (!r.isCode &&
        (r.kind === 'value' || r.kind === 'member') &&
        r.pkg === 'core') ||
      r.isCode,
  },
  {
    name: 'core README',
    files: ['packages/core/README.md'],
    applies: (r) =>
      !r.isCode &&
      (r.kind === 'value' || r.kind === 'member') &&
      r.pkg === 'core',
  },
  {
    name: 'error registry',
    files: ['docs/errors/README.md'],
    applies: (r) => r.isCode,
  },
  {
    name: 'CHANGELOG',
    files: ['CHANGELOG.md'],
    // Every new VALUE, across every package — a callable a consumer can now
    // write is a release note whether or not core shipped it. Types are
    // excluded on purpose: demanding a changelog line per interface produces
    // permanent noise, and a gate people learn to skim is worse than no gate.
    applies: (r) => r.kind === 'value' || r.kind === 'member',
  },
];

/**
 * Symbols that deliberately do not need to reach a surface, each with the reason
 * stated. An exemption is a DECISION, and a decision with no reason recorded is
 * indistinguishable from an oversight — which is the failure this gate exists to
 * catch, so it would be perverse to reintroduce it here.
 */
const EXEMPT = new Map(
  Object.entries({
    HydrateMode: 'authoring-only type; the modes are documented in prose',
    HydrateReason:
      'authoring-only type; reasons documented with onHydrateDecision',
    SerializedState: 'return type of an already-documented method',
    SerializationMethods:
      'method bag type; the methods are documented individually',
    PersistenceMethods:
      'method bag type; the methods are documented individually',
  })
);

// ── run ─────────────────────────────────────────────────────────────────────

const BASE = resolveBase();
const HEAD = 'HEAD';

const pkgDirs = git('ls-tree', '-d', '--name-only', HEAD, 'packages/')
  .split('\n')
  .map((d) => d.trim())
  .filter(Boolean);

const before = new Map();
const after = new Map();
let barrelCount = 0;
for (const dir of pkgDirs) {
  for (const barrel of barrelsFor(join(ROOT, dir))) {
    barrelCount++;
    for (const [k, v] of symbolsAt(BASE, barrel)) before.set(k, v);
    for (const [k, v] of symbolsAt(HEAD, barrel)) after.set(k, v);
  }
}

// Only interfaces public at BOTH revisions. A newly-EXPORTED interface would
// otherwise dump every field it has ever had into the delta as "new" — the
// members did not change, the type's visibility did, and the type name is
// already in the diff at the right granularity.
const stableTypes = new Set([...after.keys()].filter((n) => before.has(n)));
const membersBefore = membersAt(BASE, stableTypes);
const membersAfter = membersAt(HEAD, stableTypes);

const codesBefore = codesAt(BASE);
const codesAfter = codesAt(HEAD);

const added = [
  ...[...after.entries()]
    .filter(([name]) => !before.has(name))
    .map(([name, meta]) => ({ name, ...meta, isCode: false })),
  ...[...membersAfter.entries()]
    .filter(([name]) => !membersBefore.has(name) && !after.has(name))
    .map(([name, meta]) => ({ name, ...meta, isCode: false })),
  ...[...codesAfter]
    .filter((c) => !codesBefore.has(c))
    .map((name) => ({ name, kind: 'value', pkg: 'core', isCode: true })),
].sort((a, b) => a.name.localeCompare(b.name));

console.log(
  `\nRelease-delta claim coverage — ${BASE} -> ${HEAD}\n` +
    `${barrelCount} published barrels across ${pkgDirs.length} packages; ` +
    `${added.length} added symbol(s)/code(s).\n`
);

if (added.length === 0) {
  console.log('Nothing added since the base tag — nothing to claim.\n');
  process.exit(0);
}

const surfaceText = new Map();
for (const surface of SURFACES) {
  surfaceText.set(
    surface.name,
    surface.files
      .map((f) =>
        existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : ''
      )
      .join('\n')
  );
}

const gaps = [];
const rows = [];
for (const rec of added) {
  const missing = [];
  let applicable = 0;
  for (const surface of SURFACES) {
    if (!surface.applies(rec)) continue;
    applicable++;
    if (!surfaceText.get(surface.name).includes(rec.name)) {
      missing.push(surface.name);
    }
  }
  const exemptReason = EXEMPT.get(rec.name);
  rows.push({ ...rec, missing, applicable, exemptReason });
  if (missing.length && !exemptReason) gaps.push(rec.name);
}

const covered = rows.filter((r) => !r.missing.length).length;
const exempted = rows.filter((r) => r.missing.length && r.exemptReason).length;

if (LIST_ONLY || gaps.length) {
  console.log('');
  for (const r of rows) {
    if (!r.missing.length) continue;
    const tag = r.exemptReason ? 'exempt ' : 'MISSING';
    const kind = r.isCode ? 'code' : r.kind;
    console.log(
      `  ${tag} ${r.name.padEnd(30)} ${`(${kind}, ${r.pkg})`.padEnd(
        18
      )} ${r.missing.join(', ')}`
    );
    if (r.exemptReason) console.log(`          └─ ${r.exemptReason}`);
  }
  console.log('');
}

// Report what was COVERED, not just that nothing failed — a gate that prints
// only "✅" is indistinguishable from a gate that checked nothing, which this
// repo has now been bitten by three separate times.
console.log(
  `  ${covered} covered on every applicable surface · ` +
    `${exempted} exempt with a stated reason · ${gaps.length} uncovered.\n`
);

if (LIST_ONLY) process.exit(0);

if (gaps.length) {
  console.log(
    '❌ A capability this release adds is missing from a surface that claims to\n' +
      '   describe the library. Add it there, or add it to EXEMPT in this file\n' +
      '   WITH A REASON — an undocumented decline is what this gate exists to catch.\n'
  );
  process.exit(1);
}

console.log(
  '✅ every added symbol reaches every surface that should carry it.\n'
);
