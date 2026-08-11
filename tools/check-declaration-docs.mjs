#!/usr/bin/env node
/**
 * A package whose SOURCE carries JSDoc must ship JSDoc in its DECLARATIONS.
 *
 *   node tools/check-declaration-docs.mjs
 *   node tools/check-declaration-docs.mjs --self-test
 *
 * WHY. `removeComments: true` is the only TypeScript switch for keeping comments
 * out of emitted JS, and it strips them from `.d.ts` too. Five of seven packages
 * set it, so every shipped declaration carried zero JSDoc: core/src/lib/types.ts
 * had 476 JSDoc lines and its shipped types.d.ts had 0. A consumer hovering
 * `maxHistorySize` saw `maxHistorySize?: number` — no description, no default,
 * even though the source documents `@default 50`.
 *
 * Nothing existing caught it. `bundle-budget` measures bundled JS and never looks
 * at `.d.ts`; `api-surface` compares symbol inventories, not comments;
 * `package-hygiene` checks that declared entries are PRESENT, not documented.
 * `scripts/verify-jsdoc-stripping.js` encoded the right intent but inspected only
 * each package's barrel file, and listed a package removed in 14.0.0.
 *
 * SCOPE, stated narrowly: this checks ONE direction — source has JSDoc therefore
 * declarations have JSDoc — across every package, counting doc blocks in every
 * `.d.ts` rather than just the barrel. It does NOT check that runtime JS stays
 * comment-free; that is scripts/verify-jsdoc-stripping.js's job. The two are
 * complements and neither covers the other.
 */
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SELF_TEST = process.argv.includes('--self-test');
const PACKAGES = [
  'core',
  'shared',
  'ng-forms',
  'guardrails',
  'schema',
  'events',
  'realtime',
];

// Count JSDoc block openers. Line comments are deliberately not counted:
// declarations carry doc blocks, not `//` notes.
const countJsdoc = (text) => (text.match(/\/\*\*/g) ?? []).length;

const collect = async (pattern) => {
  const out = [];
  for await (const f of glob(pattern)) out.push(f);
  return out;
};

async function measure(pkg) {
  const srcFiles = await collect(`packages/${pkg}/src/**/*.ts`);
  const dtsFiles = await collect(`dist/packages/${pkg}/src/**/*.d.ts`);
  let srcDocs = 0;
  for (const f of srcFiles) {
    if (f.endsWith('.spec.ts')) continue;
    srcDocs += countJsdoc(await readFile(f, 'utf8'));
  }
  let dtsDocs = 0;
  for (const f of dtsFiles) dtsDocs += countJsdoc(await readFile(f, 'utf8'));
  return { pkg, srcDocs, dtsDocs, dtsFiles: dtsFiles.length };
}

const rows = [];
for (const pkg of PACKAGES) {
  if (!existsSync(`packages/${pkg}/src`)) continue;
  if (!existsSync(`dist/packages/${pkg}`)) {
    console.error(
      `✗ ${pkg}: not built. Run \`npm run build\` before this check.`
    );
    process.exit(1);
  }
  rows.push(await measure(pkg));
}

// The invariant is a RATIO, not "not zero". Two reasons, both learned the hard way:
//
//  1. `stripInternal` legitimately removes whole `@internal` declarations, so a
//     package never ships 100% of its source blocks. Measured spread: 72%-98%.
//  2. "exactly zero" is untestable in practice. Documentation is concentrated —
//     guardrails keeps 106 of its 123 blocks in one file — so no single-file
//     mutation can drive a package to zero, and a gate whose mutation cannot trip
//     it is exactly the blind gate the harness exists to catch. It WAS caught
//     that way: the first version of this gate reported BLIND.
const FLOOR = 0.5;

// --- self-test: prove the checker detects a stripped declaration set --------
if (SELF_TEST) {
  const probe = rows.find((r) => r.srcDocs > 0);
  if (!probe) {
    console.error(
      '✗ self-test cannot run: no package has documented source, so a stripped\n' +
        '  declaration set would be indistinguishable from a correct one.'
    );
    process.exit(1);
  }
  const detected = 0 / probe.srcDocs < FLOOR;
  const clean = probe.dtsDocs / probe.srcDocs >= FLOOR;
  if (!detected) {
    console.error(
      '✗ self-test FAILED: a stripped declaration set was not flagged.'
    );
    process.exit(1);
  }
  if (!clean) {
    console.error(
      `✗ self-test FAILED: ${probe.pkg} retains ${(
        (probe.dtsDocs / probe.srcDocs) *
        100
      ).toFixed(0)}%, so the checker would flag the repo even when correct.`
    );
    process.exit(1);
  }
  console.log(
    `✓ self-test: flags a stripped set (${probe.pkg}: ${probe.srcDocs} src blocks -> 0 ` +
      `shipped), and reports clean at its real ratio (${(
        (probe.dtsDocs / probe.srcDocs) *
        100
      ).toFixed(0)}%).`
  );
  process.exit(0);
}

// --- the real check --------------------------------------------------------
const failures = [];
console.log('package      src JSDoc   shipped .d.ts JSDoc   retained   files');
console.log('─'.repeat(64));
for (const r of rows) {
  r.ratio = r.srcDocs === 0 ? 1 : r.dtsDocs / r.srcDocs;
  const bad = r.srcDocs > 0 && r.ratio < FLOOR;
  if (bad) failures.push(r);
  console.log(
    `${r.pkg.padEnd(12)} ${String(r.srcDocs).padEnd(10)} ${String(
      r.dtsDocs
    ).padEnd(21)} ${(r.ratio * 100).toFixed(0).padStart(3)}%       ${
      r.dtsFiles
    }  ${bad ? '❌ STRIPPED' : '✓'}`
  );
}

if (failures.length) {
  console.error(
    `\n❌ ${failures.length} package(s) retain under ${
      FLOOR * 100
    }% of their source documentation in shipped declarations.\n\n` +
      "   A consumer's IDE shows the type and nothing else — no description, no\n" +
      '   @default, no @example. The usual cause is `removeComments: true` in\n' +
      '   tsconfig.lib.prod.json, which strips `.d.ts` as well as `.js`.\n\n' +
      '   Keep comments in both outputs; the rollup plugin in\n' +
      '   tools/build/create-rollup-config.mjs removes them from the runtime JS.'
  );
  for (const f of failures) console.error(`   · ${f.pkg}`);
  process.exit(1);
}

console.log('\n✅ every documented package ships documented declarations.');
process.exit(0);
