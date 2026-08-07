#!/usr/bin/env node
/**
 * Lint gate with teeth: errors fail, and warnings may not GROW.
 *
 * `npm run lint:all` exits 0 with 684 warnings, because nothing passes
 * `--max-warnings`. That makes the lint gate unable to fail on anything short of
 * a hard error — `tools/verify-gates.mjs --self-test` proved it, by adding an
 * unused `any`-typed function to core and watching lint report it and exit 0.
 *
 * `--max-warnings 0` is not available: 684 warnings exist today, 541 of them in
 * core, overwhelmingly `no-explicit-any` in generic plumbing where the `any` is
 * frequently load-bearing. Failing the build on all of them would mean either a
 * mass suppression sweep or a red gate, and a red gate teaches people to ignore
 * gates.
 *
 * So this is a RATCHET, per project, against a committed baseline: a project may
 * never exceed its recorded count. New code cannot add warnings; existing
 * warnings can be paid down at whatever pace suits. When a count drops the
 * baseline is tightened automatically on the next `--update`, so progress is
 * locked in rather than leaving slack for the next regression to spend.
 *
 * ## Why this does not shell out to `nx lint`
 *
 * It did at first, and parsed the printed output. That undercounted: `nx lint
 * core` TRUNCATES its output, printing 19 files where eslint reports 38, so
 * every warning in an unprinted file — including all of `utils.ts` and
 * `entity-signal.ts`, the two most load-bearing files in the library — was
 * invisible to the budget. nx's EXIT CODE is correct (a `debugger` statement in
 * utils.ts does fail it); only the text is clipped. A ratchet built on clipped
 * text would have been blind for precisely the files that matter most, which is
 * the same defect this gate was written to fix.
 *
 * So it runs eslint directly with `--format json`: complete, structured, and
 * immune to anyone's terminal formatting.
 *
 * Usage:
 *   node tools/check-lint-budget.mjs            # gate
 *   node tools/check-lint-budget.mjs --update   # re-record the baseline
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tools', 'lint-budget.json');

const PROJECTS = [
  'packages/core',
  'packages/ng-forms',
  'packages/shared',
  'packages/guardrails',
  'packages/schema',
  'packages/events',
  'packages/realtime',
  'apps/demo',
  // tools/ and scripts/ are NOT nx projects, so `nx run-many -t lint` never
  // reaches them and this list did not either — it was written from the nx
  // project list, which is a definition of "the workspace" that quietly excludes
  // every gate, harness and build script in the repo. An irregular-whitespace
  // ERROR sat in find-dead-exports.mjs while this gate reported "0 errors":
  // the gate that exists to prove other gates can fail was itself not linted.
  // Caught by an external hook, not by anything here, which is the whole reason
  // the coverage counts below are printed rather than assumed.
  'tools',
  'scripts',
];

/** Per-project warning counts and total errors, from eslint's own JSON. */
const counts = {};
let errors = 0;
let filesLinted = 0;

for (const project of PROJECTS) {
  let json = '';
  try {
    json = execSync(`npx eslint ${project} --format json`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // eslint exits 1 when it reports errors, and still writes valid JSON.
    json = err.stdout ?? '';
    if (!json.trim()) {
      console.error(`✗ eslint failed to run for ${project}:\n${err.stderr ?? err.message}`);
      process.exit(1);
    }
  }
  let results;
  try {
    results = JSON.parse(json);
  } catch {
    console.error(`✗ could not parse eslint JSON for ${project}`);
    process.exit(1);
  }
  filesLinted += results.length;
  counts[project] = results.reduce((a, f) => a + f.warningCount, 0);
  errors += results.reduce((a, f) => a + f.errorCount, 0);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({ counts, total, filesLinted }, null, 2)}\n`);
  console.log(
    `Recorded baseline: ${total} warnings across ${filesLinted} files in ` +
      `${Object.keys(counts).length} projects.`
  );
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`No baseline at tools/lint-budget.json — run with --update first.`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

// Report what was covered, not merely that it passed.
console.log(
  `Lint budget — ${total} warnings now, ${base.total} recorded, ${errors} errors, ` +
    `across ${filesLinted} files in ${PROJECTS.length} projects.\n`
);

let over = 0;
let under = 0;
const projects = new Set([...Object.keys(counts), ...Object.keys(base.counts)]);
for (const p of [...projects].sort()) {
  const now = counts[p] ?? 0;
  const was = base.counts[p] ?? 0;
  if (now > was) {
    over++;
    console.error(`  ✗ ${p.padEnd(22)} ${was} → ${now}  (+${now - was}) — new warnings are not allowed`);
  } else if (now < was) {
    under++;
    console.log(`  ↓ ${p.padEnd(22)} ${was} → ${now}  (-${was - now}) — run --update to lock this in`);
  } else {
    console.log(`  · ${p.padEnd(22)} ${now}`);
  }
}

if (errors) {
  console.error(`\n${errors} eslint ERROR(s) — these fail regardless of the warning budget.`);
}
if (over) {
  console.error(
    `\n${over} project(s) above budget. Fix the new warnings, or if they are ` +
      `genuinely unavoidable, run --update and say why in the commit message.`
  );
}
if (under) {
  console.log(`\n${under} project(s) below budget — \`--update\` to tighten the ratchet.`);
}
process.exit(errors || over ? 1 : 0);
