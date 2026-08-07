#!/usr/bin/env node
/**
 * Every symbol on the ROOT barrel must appear in the demo app.
 *
 * ## The invariant, and why it is stronger than the one it joins
 *
 * `tools/find-dead-exports.mjs` asks whether anything *imports* a symbol —
 * reachability. This asks whether anything *shows it to a person* — and the
 * repo already claims the stronger property: if everything usable is demoed,
 * then everything exported is in the demo.
 *
 * It was not true. 26 of 59 root runtime exports were absent, and the absentees
 * were not a scattering of overlooked features — they were all of one kind. The
 * READER allowlists exist to TYPE `asReadonly`; the marker symbols are brands
 * for writing a marker processor; the guards answer questions you only ask while
 * walking a tree. None of it is app code, and all of it was on the entry point
 * an app imports.
 *
 * So the failure was not "the demo is incomplete". It was that the root barrel
 * mixed the app API with authoring plumbing, and this check is what made that
 * visible. Those symbols moved to `@signaltree/core/authoring` in 14.0.0 — an
 * entry point that already existed for exactly this distinction.
 *
 * ## What is NOT checked
 *
 * Only the root barrel. `/authoring`, `/lazy`, `/security`, `/edit-session` and
 * `/storage` are deliberately exempt: they exist for enhancer authors, tooling
 * and specialised runtimes, and demanding an app demo for them would push
 * exactly the wrong way — toward moving plumbing BACK to the root so it could be
 * demoed there.
 *
 * ## Matching is by word, which over-counts
 *
 * A symbol "appears" if its name occurs as a word anywhere in the demo's TS or
 * HTML. That will call a symbol covered when it is only named in a comment. The
 * looser test is deliberate: the tight version (parse the imports) would fail on
 * the demo's own re-exports and dynamic pages, and this gate's job is to catch a
 * whole category going undemonstrated, not to police one mention.
 *
 * Usage:
 *   node tools/check-demo-coverage.mjs           # gate
 *   node tools/check-demo-coverage.mjs --list    # show what is covered
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CORE = join(ROOT, 'dist/packages/core/dist/index.js');
const DEMO = join(ROOT, 'apps/demo/src');

const SKIP = new Set(['node_modules', 'dist', '.angular', '.nx']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|html)$/.test(name)) out.push(full);
  }
  return out;
}

let demoSource;
try {
  demoSource = walk(DEMO)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
} catch (err) {
  console.error(`✗ could not read the demo app at ${DEMO}: ${err.message}`);
  process.exit(1);
}

let exports;
try {
  exports = Object.keys(await import(CORE)).sort();
} catch (err) {
  console.error(`✗ could not load the built core barrel — run \`nx build core\` first.\n  ${err.message}`);
  process.exit(1);
}

if (exports.length === 0) {
  // A barrel that exports nothing would make this gate pass trivially, which is
  // the shape of every silent-pass defect this repo has collected.
  console.error('✗ the core barrel exported NOTHING — the build is broken, not the demo.');
  process.exit(1);
}

const covered = [];
const absent = [];
for (const name of exports) {
  (new RegExp(`\\b${name}\\b`).test(demoSource) ? covered : absent).push(name);
}

console.log(
  `Demo coverage of the ROOT barrel: ${covered.length}/${exports.length} ` +
    `(${walk(DEMO).length} demo files scanned).`
);

if (process.argv.includes('--list')) {
  console.log(`\ncovered:\n  ${covered.join(', ')}`);
}

if (absent.length) {
  console.error(`\n✗ ${absent.length} root export(s) never appear in the demo:\n`);
  for (const n of absent) console.error(`    ${n}`);
  console.error(
    `\nOne of two things is true, and they need different fixes:\n` +
      `  1. It is app API and the demo is missing it — add a usage.\n` +
      `  2. It is plumbing for enhancer/marker/tooling authors — move it to\n` +
      `     '@signaltree/core/authoring', where the other 39 such symbols live.\n` +
      `Do not silence this by widening the match.`
  );
  process.exit(1);
}

console.log('✓ every root-barrel export is demonstrated in the demo app.');
