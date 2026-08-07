#!/usr/bin/env node
/**
 * Every `@signaltree/*` symbol named in a shipped README must actually exist.
 *
 * ## Why this is narrower than lint-skills, on purpose
 *
 * `lint-skills.mjs` type-checks whole code blocks, which is the right bar for
 * `docs/skills/**` because those are written to be compiled. Pointing it at the
 * package READMEs produces ~170 errors, and almost all of them are the linter's
 * own model rather than doc defects: it concatenates every block in a file into
 * one scope, so a README that declares `const tree` in five examples reports
 * four redeclarations. Gating on that number would mean a permanently red gate,
 * and a permanently red gate teaches people to ignore gates.
 *
 * So this checks the ONE thing that is unambiguous and that actually burns a
 * user: does the symbol exist in the package the README says to import it from?
 * A reader copying an import that resolves to nothing is a broken first
 * experience, and READMEs ship inside the npm tarball.
 *
 * ## What it found the first time it ran
 *
 * Thirteen dead references across four shipped READMEs — `effects()` documented
 * with a full example and a note that "removal is planned", years after it was
 * removed; `bindFormToTree` in an example two paragraphs below prose correctly
 * naming `formBridge`; three guardrails functions that never existed at all;
 * `assertEventMatches` / `assertEventSequence` / `createTestEventBatch` against
 * a testing entry point that exports `createEventAssertions`; and
 * `createWizardForm`, which turned out to be implemented, documented, and
 * exported from nowhere.
 *
 * Usage:
 *   node scripts/lint-readme-apis.mjs
 *   node scripts/lint-readme-apis.mjs --list
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Package → the built declaration entry for each of its subpaths. */
function entryPoints(pkg) {
  const base = join(ROOT, 'dist/packages', pkg);
  const out = new Map();
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
  } catch {
    return out;
  }
  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    if (subpath.endsWith('package.json') || subpath.includes('*')) continue;
    const declared =
      typeof value === 'string' ? null : (value.types ?? value.default?.types);
    if (typeof declared !== 'string') continue;
    const file = join(base, declared);
    if (existsSync(file)) {
      const spec = subpath === '.' ? `@signaltree/${pkg}` : `@signaltree/${pkg}${subpath.slice(1)}`;
      out.set(spec, file);
    }
  }
  return out;
}

/** Exported names of a declaration file, following its re-export edges. */
function exportsOf(file, seen = new Set(), out = new Set()) {
  if (!file || seen.has(file) || !existsSync(file)) return out;
  seen.add(file);
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const s of sf.statements) {
    const mods = ts.canHaveModifiers(s) ? (ts.getModifiers(s) ?? []) : [];
    if (mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations)
          if (ts.isIdentifier(d.name)) out.add(d.name.text);
      } else if (s.name && ts.isIdentifier(s.name)) out.add(s.name.text);
    }
    if (ts.isExportDeclaration(s)) {
      if (s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const e of s.exportClause.elements) out.add(e.name.text);
        continue;
      }
      const spec = s.moduleSpecifier?.text;
      if (spec?.startsWith('.')) {
        const base = resolve(dirname(file), spec);
        for (const c of [`${base}.d.ts`, join(base, 'index.d.ts')])
          if (existsSync(c)) { exportsOf(c, seen, out); break; }
      }
    }
  }
  return out;
}

const SURFACE = new Map();
for (const pkg of readdirSync(join(ROOT, 'dist/packages'))) {
  for (const [spec, file] of entryPoints(pkg)) SURFACE.set(spec, exportsOf(file));
}
if (SURFACE.size === 0) {
  console.error('✗ no built packages found — run `npm run build:all` first.');
  process.exit(1);
}

/**
 * Documents that DESCRIBE THE PAST are exempt, and the distinction is the whole
 * reason this check can be green.
 *
 * A migration guide's "before" block is *supposed* to name an API that no longer
 * exists — that is what the reader is migrating away from. Same for an RFC, an
 * audit, or a learnings write-up: they record what was true when written. Twenty
 * of the first thirty-one hits were exactly this, and "fixing" them would have
 * meant deleting the evidence a migration guide exists to show.
 *
 * What is NOT exempt is anything a reader follows as current advice — the
 * guides, the architecture docs, and above all `docs/ai/**`, which becomes the
 * `llms.txt` that ships in the core tarball. A dead API there is one an agent
 * will generate.
 */
const HISTORICAL_DIRS = new Set(['archive', 'rfcs', 'audits', 'learnings']);
const HISTORICAL_FILE = /migration|MIGRATION|CHANGELOG/;

/** Everything a user or an agent reads: shipped READMEs plus all of docs/. */
function markdownUnder(dir, out = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${name.name}`;
    if (name.isDirectory()) {
      if (HISTORICAL_DIRS.has(name.name) || name.name === 'node_modules') continue;
      markdownUnder(rel, out);
    } else if (name.name.endsWith('.md') && !HISTORICAL_FILE.test(rel)) {
      out.push(rel);
    }
  }
  return out;
}

const READMES = [
  'README.md',
  ...readdirSync(join(ROOT, 'packages'))
    .map((p) => `packages/${p}/README.md`)
    .filter((f) => existsSync(join(ROOT, f))),
  ...markdownUnder('docs'),
];

/** `import { a, b as c } from '@signaltree/x';` inside a fenced block. */
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'(@signaltree\/[^']+)'/g;

const problems = [];
let checked = 0;

for (const rel of READMES) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const lines = text.split('\n');
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[2];
    const surface = SURFACE.get(spec);
    if (!surface) continue; // an entry point we do not build, e.g. a planned one
    const line = text.slice(0, m.index).split('\n').length;
    // A block explicitly opted out is not our business.
    const context = lines.slice(Math.max(0, line - 4), line).join('\n');
    if (/@skip-lint|```ts\s+(wrong|bad)/.test(context)) continue;

    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      checked++;
      if (!surface.has(name)) {
        const near = [...surface].find(
          (s) => s.toLowerCase().includes(name.toLowerCase().slice(0, 6)) && s !== name
        );
        problems.push({ rel, line, name, spec, near });
      }
    }
  }
}

console.log(
  `Checked ${checked} imported symbol(s) across ${READMES.length} README(s) ` +
    `against ${SURFACE.size} built entry point(s).`
);

if (process.argv.includes('--list')) {
  for (const [spec, names] of SURFACE) console.log(`  ${spec}: ${names.size} exports`);
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} symbol(s) named in a README do not exist:\n`);
  for (const p of problems) {
    console.error(
      `    ${p.rel}:${p.line}  '${p.name}' is not exported by ${p.spec}` +
        (p.near ? `  (did you mean '${p.near}'?)` : '')
    );
  }
  console.error(
    `\nREADMEs ship inside the npm tarball, so this is the first thing a user\n` +
      `copies. Either fix the name, or export the symbol if the docs are right\n` +
      `and the barrel is wrong — that is how createWizardForm was found.`
  );
  process.exit(1);
}

console.log('✓ every @signaltree symbol named in a README exists.');
