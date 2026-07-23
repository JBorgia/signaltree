#!/usr/bin/env node

/**
 * Taught-Symbol Verification (RFC 0004 §4 step 6 / §3 V-P6)
 * =========================================================
 *
 * Two blocking checks against the AI-facing doc `apps/demo/public/llms-full.txt`:
 *
 * 1. REVERSE DIFF — every symbol the doc claims is importable from
 *    `@signaltree/core` (root or any subpath) must actually be exported by the
 *    built d.ts barrel of that exact entry point. This catches phantom and
 *    removed APIs — the real hallucination vector. Canonical case: llms-full
 *    once taught `import { createIndexedDBAdapter } from '@signaltree/core'`
 *    (root) while the symbol only exists at `@signaltree/core/storage`.
 *
 *    Conservative scope (deliberate): only identifiers claimed inside an
 *    `import { ... } from '@signaltree/core[/subpath]'` statement are treated
 *    as taught-importable. Prose backticks are NOT failed on — the doc
 *    legitimately backticks NgRx/Akita/Elf symbols (disambiguation tables),
 *    removed APIs ("`memoization()` — removed in 9.0.1"), and config keys.
 *
 * 2. GOLDEN API LIST — a curated list of core capabilities checked BOTH ways:
 *    each must be exported from its documented entry point AND taught (appear
 *    inside a code span or fenced block) in llms-full.txt. Catches "shipped a
 *    capability, never taught it".
 *
 * REQUIRES A BUILD: reads the d.ts barrels under dist/packages/core. If dist
 * is missing, run `npx nx build core --configuration=production` (exit code 2 tells
 * you so). pre-publish-validation.sh runs this after its build step.
 *
 * Usage:
 *   node scripts/verify-taught-symbols.js               # run the gates
 *   node scripts/verify-taught-symbols.js --self-test   # negative test: prove
 *       the gates can fail (RFC 0004 §5 rule 2 — an untested gate is presumed
 *       inert). Seeds the canonical createIndexedDBAdapter-at-root violation
 *       and a phantom import into in-memory fixtures and asserts failure.
 *
 * Exit codes: 0 = pass, 1 = gate violation, 2 = environment/usage error.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_CORE = path.join(ROOT, 'dist', 'packages', 'core');
const LLMS_FULL = path.join(ROOT, 'apps', 'demo', 'public', 'llms-full.txt');

// Symbols the doc imports but that are DELIBERATELY not exported (yet).
// Every entry needs a citation. These print as loud warnings, never silently.
// Burn this list down — each entry is live doc/code dissonance an AI consumer
// will trip on. Emptied 2026-07-23 (RFC 0004 §4 step 8): the
// asyncStream/createAsyncStreamSignal dissonance was resolved by removing the
// teaching sections from llms.txt/llms-full.txt/SKILL.md — per RFC 0001 §5 the
// symbols stay experimental and unexported; the docs now say so explicitly.
const KNOWN_UNSHIPPED = {};

// ---------------------------------------------------------------------------
// d.ts export parsing
// ---------------------------------------------------------------------------

/** Extract exported names (values and types) from a d.ts barrel's text. */
function parseDtsExports(dtsText) {
  const names = new Set();

  // export { a, b as c, type D } [from '...'];  /  export type { A, B } ...
  for (const m of dtsText.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (let item of m[1].split(',')) {
      item = item.trim();
      if (!item) continue;
      item = item.replace(/^type\s+/, '');
      // `orig as alias` exports `alias`
      const asMatch = item.match(/^\S+\s+as\s+(\S+)$/);
      names.add(asMatch ? asMatch[1] : item);
    }
  }

  // export declare function|const|class|enum X / export declare abstract class X
  for (const m of dtsText.matchAll(
    /export\s+declare\s+(?:abstract\s+)?(?:function|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }

  // export type X = / export interface X
  for (const m of dtsText.matchAll(
    /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }

  return names;
}

/**
 * Build { '<subpath or ''>': Set<exportedName> } from the built package.
 * Entry points are read from dist/packages/core/package.json "exports" so the
 * gate tracks the published surface, not a hardcoded list.
 */
function loadEntryPointExports() {
  const pkgJsonPath = path.join(DIST_CORE, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(
      `Missing ${path.relative(ROOT, pkgJsonPath)} — build core first:\n` +
        '  npx nx build core --configuration=production'
    );
    process.exit(2);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const entries = {};
  for (const [key, value] of Object.entries(pkg.exports || {})) {
    if (key === './package.json') continue;
    const typesRel =
      typeof value === 'object' && value !== null ? value.types : null;
    if (!typesRel) continue;
    const dtsPath = path.join(DIST_CORE, typesRel);
    if (!fs.existsSync(dtsPath)) {
      console.error(
        `Entry point ${key} declares types ${typesRel} but the file is ` +
          'missing from dist — rebuild core.'
      );
      process.exit(2);
    }
    const subpath = key === '.' ? '' : key.slice(1); // './storage' -> '/storage'
    entries[subpath] = parseDtsExports(fs.readFileSync(dtsPath, 'utf8'));
  }
  if (!entries['']) {
    console.error('Could not resolve the root entry point from dist package.json.');
    process.exit(2);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Gate 1: reverse diff (import-claim audit)
// ---------------------------------------------------------------------------

const IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]@signaltree\/core(\/[\w-]+)?['"]/g;

/** Returns { violations: string[], warnings: string[], checked: number } */
function auditImportClaims(docText, entryExports) {
  const violations = [];
  const warnings = [];
  let checked = 0;

  for (const m of docText.matchAll(IMPORT_RE)) {
    const subpath = m[2] || '';
    const entrySet = entryExports[subpath];
    if (!entrySet) {
      violations.push(
        `doc imports from '@signaltree/core${subpath}' — no such entry point ` +
          `in the published exports map`
      );
      continue;
    }
    for (let name of m[1].split(',')) {
      name = name.trim();
      if (!name) continue;
      name = name.replace(/^type\s+/, '');
      const asMatch = name.match(/^(\S+)\s+as\s+\S+$/);
      if (asMatch) name = asMatch[1];
      checked++;
      if (entrySet.has(name)) continue;
      if (KNOWN_UNSHIPPED[name]) {
        warnings.push(
          `'${name}' taught as importable from '@signaltree/core${subpath}' but ` +
            `NOT exported — allowed only because: ${KNOWN_UNSHIPPED[name]}`
        );
        continue;
      }
      violations.push(
        `'${name}' is taught as \`import { ${name} } from '@signaltree/core${subpath}'\` ` +
          `but the built d.ts for that entry point does not export it ` +
          `(phantom/removed API, or wrong subpath)`
      );
    }
  }
  return { violations, warnings, checked };
}

// ---------------------------------------------------------------------------
// Gate 2: golden API list (both ways)
// ---------------------------------------------------------------------------

// Curated capabilities. Every entry must be (a) exported from its documented
// entry point and (b) taught in llms-full.txt. Verified against the built
// d.ts on 2026-07-23. Candidates deliberately NOT listed because they are
// exported but untaught today: toWritableSignal, composeEnhancers. asyncStream
// is deliberately neither exported nor taught (RFC 0001 §5 — experimental;
// the step-8 doc pass removed its teaching sections). Note: loadOrThrow/load
// are loader-surface METHODS, not importable symbols — not golden-eligible.
const GOLDEN_API = [
  // root entry point
  { name: 'signalTree', entry: '' },
  { name: 'defineStore', entry: '' },
  { name: 'asReadonly', entry: '' },
  { name: 'entityMap', entry: '' },
  { name: 'status', entry: '' },
  { name: 'stored', entry: '' },
  { name: 'form', entry: '' },
  { name: 'asyncSource', entry: '' },
  { name: 'asyncQuery', entry: '' },
  { name: 'linked', entry: '' },
  { name: 'derivedFrom', entry: '' },
  { name: 'invalidateTag', entry: '' },
  { name: 'validators', entry: '' },
  { name: 'withKind', entry: '' },
  { name: 'batching', entry: '' },
  { name: 'effects', entry: '' },
  { name: 'devTools', entry: '' },
  { name: 'timeTravel', entry: '' },
  { name: 'persistence', entry: '' },
  { name: 'serialization', entry: '' },
  { name: 'equal', entry: '' },
  { name: 'LoadingState', entry: '' },
  // documented subpaths
  { name: 'security', entry: '/security' },
  { name: 'SecurityValidator', entry: '/security' },
  { name: 'SecurityPresets', entry: '/security' },
  { name: 'lazy', entry: '/lazy' },
  { name: 'createIndexedDBAdapter', entry: '/storage' },
  { name: 'createStorageAdapter', entry: '/storage' },
  { name: 'createEditSession', entry: '/edit-session' },
  { name: 'createTreeEditSession', entry: '/edit-session' },
];

/** Concatenate fenced blocks + inline code spans — where APIs are "taught". */
function extractCodeRegions(docText) {
  const parts = [];
  for (const m of docText.matchAll(/```[\s\S]*?```/g)) parts.push(m[0]);
  const withoutFences = docText.replace(/```[\s\S]*?```/g, '');
  for (const m of withoutFences.matchAll(/`[^`\n]+`/g)) parts.push(m[0]);
  return parts.join('\n');
}

function auditGoldenList(docText, entryExports) {
  const violations = [];
  const codeRegions = extractCodeRegions(docText);
  for (const { name, entry } of GOLDEN_API) {
    const entrySet = entryExports[entry];
    if (!entrySet || !entrySet.has(name)) {
      violations.push(
        `golden symbol '${name}' is NOT exported from '@signaltree/core${entry}' ` +
          `(capability removed or moved? update GOLDEN_API deliberately)`
      );
    }
    const taught = new RegExp(`\\b${name}\\b`).test(codeRegions);
    if (!taught) {
      violations.push(
        `golden symbol '${name}' is exported but NOT taught in llms-full.txt ` +
          `(shipped a capability, never taught it)`
      );
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test (negative test — RFC 0004 §5 rule 2)
// ---------------------------------------------------------------------------

function selfTest(entryExports) {
  let failed = 0;
  const expect = (label, cond) => {
    if (cond) console.log(`  ✅ self-test: ${label}`);
    else {
      console.error(`  ❌ self-test FAILED: ${label}`);
      failed++;
    }
  };

  // Parser sanity — if these fail the whole gate is measuring nothing.
  expect("root barrel exports 'signalTree'", entryExports[''].has('signalTree'));
  expect(
    "root barrel does NOT export 'createIndexedDBAdapter' (it lives at /storage)",
    !entryExports[''].has('createIndexedDBAdapter')
  );
  expect(
    "/storage barrel exports 'createIndexedDBAdapter'",
    entryExports['/storage'] && entryExports['/storage'].has('createIndexedDBAdapter')
  );

  // Canonical historical bug, reintroduced in a fixture (NOT the real file):
  // createIndexedDBAdapter taught at the ROOT entry point.
  const canonical = auditImportClaims(
    "```typescript\nimport { createIndexedDBAdapter } from '@signaltree/core';\n```",
    entryExports
  );
  expect(
    'reverse diff flags createIndexedDBAdapter taught at root (canonical case)',
    canonical.violations.length === 1
  );

  // Phantom API never shipped.
  const phantom = auditImportClaims(
    "```typescript\nimport { createQuantumAdapter } from '@signaltree/core';\n```",
    entryExports
  );
  expect('reverse diff flags a phantom import', phantom.violations.length === 1);

  // Non-existent subpath.
  const badSubpath = auditImportClaims(
    "```typescript\nimport { signalTree } from '@signaltree/core/quantum';\n```",
    entryExports
  );
  expect('reverse diff flags a non-existent subpath', badSubpath.violations.length === 1);

  // Control: a correct import must NOT be flagged.
  const control = auditImportClaims(
    "```typescript\nimport { signalTree } from '@signaltree/core';\nimport { createIndexedDBAdapter } from '@signaltree/core/storage';\n```",
    entryExports
  );
  expect(
    'reverse diff passes correct imports (control)',
    control.violations.length === 0 && control.checked === 2
  );

  // Golden list must fail on a doc that teaches nothing.
  const golden = auditGoldenList('# empty doc\nno code here', entryExports);
  expect(
    'golden list flags every symbol as untaught against an empty doc',
    golden.length >= GOLDEN_API.length
  );

  // Golden list must fail if a golden symbol stops being exported.
  const mutilated = {};
  for (const [k, v] of Object.entries(entryExports)) mutilated[k] = new Set(v);
  mutilated[''].delete('signalTree');
  const goldenExport = auditGoldenList(
    fs.readFileSync(LLMS_FULL, 'utf8'),
    mutilated
  );
  expect(
    "golden list flags 'signalTree' when removed from the export set",
    goldenExport.some((v) => v.includes("'signalTree' is NOT exported"))
  );

  if (failed > 0) {
    console.error(`\n❌ SELF-TEST FAILED (${failed}) — the gate cannot be trusted`);
    process.exit(1);
  }
  console.log('\n✅ Self-test passed — gate demonstrably able to fail');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const entryExports = loadEntryPointExports();

  if (process.argv.includes('--self-test')) {
    console.log('🧪 verify-taught-symbols --self-test (negative test, RFC 0004 §5 rule 2)\n');
    selfTest(entryExports);
    return;
  }

  if (!fs.existsSync(LLMS_FULL)) {
    console.error(`Missing ${path.relative(ROOT, LLMS_FULL)}`);
    process.exit(2);
  }
  const docText = fs.readFileSync(LLMS_FULL, 'utf8');

  console.log('🔍 Verifying taught symbols against built @signaltree/core d.ts\n');

  const imports = auditImportClaims(docText, entryExports);
  console.log(
    `Reverse diff: ${imports.checked} import-claimed symbol(s) checked against ` +
      `${Object.keys(entryExports).length} entry point(s)`
  );
  for (const w of imports.warnings) console.warn(`  ⚠️  ${w}`);
  for (const v of imports.violations) console.error(`  ❌ ${v}`);

  const golden = auditGoldenList(docText, entryExports);
  console.log(`Golden list: ${GOLDEN_API.length} symbol(s) checked both ways`);
  for (const v of golden) console.error(`  ❌ ${v}`);

  const total = imports.violations.length + golden.length;
  if (total > 0) {
    console.error(`\n❌ TAUGHT-SYMBOL VERIFICATION FAILED (${total} violation(s))`);
    console.error(
      'Either the doc teaches an API that does not exist (fix llms-full.txt) ' +
        'or an API was removed/moved without a doc pass (fix the docs or the export).'
    );
    process.exit(1);
  }
  if (imports.warnings.length > 0) {
    console.warn(
      `\n⚠️  ${imports.warnings.length} known doc/code dissonance(s) allowed by ` +
        'KNOWN_UNSHIPPED — burn these down in the RFC 0004 step-8 doc pass.'
    );
  }
  console.log('\n✅ All taught symbols exist; all golden symbols exported AND taught');
  process.exit(0);
}

main();
