#!/usr/bin/env node
/**
 * Public API surface inventory — the baseline an export freeze is diffed against.
 *
 * Resolves the EFFECTIVE exported symbol graph of every publishable package,
 * through every entrypoint declared in its `exports` map, using the TypeScript
 * checker rather than by reading `index.ts` with a regex.
 *
 * WHY NOT REGEX. Reconnaissance counts from `grep -c '^export'` said core had
 * 141 root exports. The real surface is 209 across six entrypoints, because a
 * regex cannot follow `export * from` barrels, cannot see subpath entrypoints,
 * and cannot tell a type from a value. `@signaltree/ng-forms` is the extreme
 * case: its root is FOUR star barrels, so a regex reports one export where the
 * checker reports 34.
 *
 * ALIASES ARE THE TRAP. `export { x } from './y'` produces an Alias symbol
 * whose own flags say nothing about whether `x` is a value or a type — reading
 * `SymbolFlags.Value` off the alias reported core as having 2 runtime exports
 * instead of 84. Every symbol is resolved through `getAliasedSymbol` first.
 *
 * TWO DIFFERENT ANGULAR QUESTIONS, deliberately separated:
 *   - `angularInDecl` — the file DECLARING this symbol imports Angular. Says
 *     something about the implementation, nothing about the contract.
 *   - `angularInType` — the symbol's PUBLIC TYPE mentions an Angular type, so a
 *     consumer cannot even TYPE-CHECK against it without Angular.
 * Conflating them overstates coupling badly: core has 169 of the first and 3 of
 * the second.
 *
 * NEITHER SETTLES A PEER DEPENDENCY, and this tool must not be read as if it
 * did. A package whose emitted entrypoint contains `import { inject } from
 * '@angular/core'` needs Angular AT RUNTIME even when no exported signature
 * mentions it. There are four distinct questions and this file answers only
 * the middle two:
 *
 *   Angular in the public .d.ts        -> consumer TYPE coupling      (here)
 *   Angular imported by source         -> implementation coupling     (here)
 *   Angular in the emitted entrypoint  -> consumer RUNTIME dependency (NOT here)
 *   Angular in peerDependencies        -> installation contract       (NOT here)
 *
 * Audit the BUILT entrypoints before changing any peer declaration.
 *
 * `angularInType` is also a heuristic: it matches a fixed list of framework type
 * names against `typeToString()`. Good enough to rank surfaces for review, not
 * proof that a declaration graph is framework-free.
 *
 * Usage:
 *   node tools/api-inventory.mjs            # write tools/api-baseline.json
 *   node tools/api-inventory.mjs --check    # fail if the surface drifted
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tools', 'api-baseline.json');

/** Types whose presence in a public signature makes a peer dependency real. */
const FRAMEWORK_TYPES =
  /\b(Signal|WritableSignal|InjectionToken|ElementRef|Injector|DestroyRef|Provider|EnvironmentProviders|ModuleWithProviders|AbstractControl|FormGroup|FormControl|ValidationErrors|Observable)\b/;

function publishablePackages() {
  return fs
    .readdirSync(path.join(ROOT, 'packages'))
    .filter((d) => {
      const pj = path.join(ROOT, 'packages', d, 'package.json');
      if (!fs.existsSync(pj)) return false;
      return !JSON.parse(fs.readFileSync(pj, 'utf8')).private;
    })
    .sort();
}

function entrypointsFor(pkg) {
  const pj = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'packages', pkg, 'package.json'), 'utf8')
  );
  const entries = [];
  for (const key of Object.keys(pj.exports ?? {})) {
    if (key === './package.json') continue;
    const base = key === '.' ? 'index' : key.replace(/^\.\//, '');
    for (const rel of [`src/${base}.ts`, `src/${base}/index.ts`]) {
      const abs = path.join(ROOT, 'packages', pkg, rel);
      if (fs.existsSync(abs)) {
        entries.push({ key, file: abs });
        break;
      }
    }
  }
  return entries;
}

function inventoryPackage(pkg) {
  const entries = entrypointsFor(pkg);
  if (!entries.length) return { entrypoints: [], symbols: [] };

  const program = ts.createProgram(
    entries.map((e) => e.file),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: ROOT,
      paths: { '@signaltree/*': ['packages/*/src/index.ts'] },
    }
  );
  const checker = program.getTypeChecker();
  const symbols = [];

  for (const { key, file } of entries) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const mod = checker.getSymbolAtLocation(sf);
    if (!mod) continue;

    for (const raw of checker.getExportsOfModule(mod)) {
      let s = raw;
      if (raw.flags & ts.SymbolFlags.Alias) {
        try {
          s = checker.getAliasedSymbol(raw);
        } catch {
          /* unresolved alias: fall back to the alias itself */
        }
      }
      const decl = s.declarations?.[0];
      const declFile = decl
        ? path.relative(ROOT, decl.getSourceFile().fileName)
        : '(unresolved)';
      const isValue = !!(s.flags & ts.SymbolFlags.Value);
      const isTypeish = !!(
        s.flags &
        (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)
      );
      let typeStr = '';
      try {
        typeStr = checker.typeToString(
          checker.getTypeOfSymbolAtLocation(s, decl ?? sf)
        );
      } catch {
        /* opaque type; leave blank rather than guessing */
      }
      const declSrc = decl ? decl.getSourceFile().text : '';

      symbols.push({
        name: raw.getName(),
        subpath: key,
        kind: isValue ? (isTypeish ? 'value+type' : 'runtime') : 'type-only',
        declFile,
        angularInDecl: /from '@angular\//.test(declSrc),
        angularInType: FRAMEWORK_TYPES.test(typeStr),
        internalDecl: /\/(internals|physical)\//.test(declFile),
      });
    }
  }

  symbols.sort((a, b) =>
    a.subpath === b.subpath
      ? a.name.localeCompare(b.name)
      : a.subpath.localeCompare(b.subpath)
  );
  return { entrypoints: entries.map((e) => e.key), symbols };
}

const surface = {};
for (const pkg of publishablePackages()) surface[pkg] = inventoryPackage(pkg);

const check = process.argv.includes('--check');
const serialized = JSON.stringify(surface, null, 2) + '\n';

if (check) {
  if (!fs.existsSync(BASELINE)) {
    console.error('No baseline. Run `node tools/api-inventory.mjs` first.');
    process.exit(1);
  }
  const previous = fs.readFileSync(BASELINE, 'utf8');
  if (previous === serialized) {
    console.log('Public API surface matches the baseline.');
    process.exit(0);
  }
  const before = new Set();
  const after = new Set();
  for (const [pkg, v] of Object.entries(JSON.parse(previous)))
    for (const s of v.symbols) before.add(`${pkg}${s.subpath} :: ${s.name}`);
  for (const [pkg, v] of Object.entries(surface))
    for (const s of v.symbols) after.add(`${pkg}${s.subpath} :: ${s.name}`);
  for (const k of after) if (!before.has(k)) console.error(`  ADDED    ${k}`);
  for (const k of before) if (!after.has(k)) console.error(`  REMOVED  ${k}`);
  console.error('\nPublic API surface changed. Update the baseline deliberately.');
  process.exit(1);
}

fs.writeFileSync(BASELINE, serialized);
console.log('pkg          total  runtime  type-only  ng-in-type  internal-decl');
for (const [pkg, v] of Object.entries(surface)) {
  const rt = v.symbols.filter((s) => s.kind !== 'type-only').length;
  const ty = v.symbols.filter((s) => s.kind === 'type-only').length;
  const ngT = v.symbols.filter((s) => s.angularInType).length;
  const int = v.symbols.filter((s) => s.internalDecl).length;
  console.log(
    pkg.padEnd(13) +
      String(v.symbols.length).padEnd(7) +
      String(rt).padEnd(9) +
      String(ty).padEnd(11) +
      String(ngT).padEnd(12) +
      int
  );
}
console.log(`\nBaseline written to ${path.relative(ROOT, BASELINE)}`);
