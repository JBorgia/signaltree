#!/usr/bin/env node
/**
 * Gate: spec files are typechecked, ratcheted per file.
 *
 * ## The hole this closes
 *
 * `tsconfig.typecheck-all.json` excludes `**\/*.spec.ts`, and core's
 * `tsconfig.typecheck.json` includes only `src/**\/*.typing.spec.ts`. So ordinary
 * spec files were typechecked by NOTHING, and Vitest transpiles via esbuild, which
 * strips types without checking them.
 *
 * What that permitted, found in 14.1.0:
 *
 *     const mk = (history: boolean) =>
 *       signalTree({ rows: entityMap({ selectId: r => r.id, history }) })
 *
 * `history` was renamed to `recordHistory` in 14.1.0 and `EntityConfig` no longer
 * declares it. The test claimed to pin "the flag must not reach serialize()", but
 * both of its arms built an identical default-configured tree, so its equality
 * assertion held vacuously. The suite stayed green while the premise of the test
 * had evaporated. Mutation-testing caught it; that is far too expensive to rely on.
 *
 * ## Why a ratchet rather than a clean gate
 *
 * Turning the check on cold reports 238 errors across 43 files, nearly all
 * test-idiom noise: implicit-any callback params, deliberately loose casts,
 * generic-constraint probes in typing specs. Fixing those is worthwhile and is a
 * separate job. Blocking the release on it would mean either doing all 238 now or
 * shipping with no check at all — and the second is how the vacuous test survived.
 *
 * So: per-file counts are frozen. A file may not get worse, and a file with no
 * baseline entry must be clean. Renaming a public config option now fails here
 * instead of passing silently.
 *
 * ## Why not a hand-rolled AST scan instead
 *
 * Tried first, and discarded: a scanner that mapped each marker to one config type
 * produced 151 findings of which nearly all were false. `entityMap({ load })` is
 * legal via an INTERSECTION in an overload signature
 * (`EntityConfig<E,K> & { load: LoaderFeature<E,P> }`), not via `EntityConfig`; and
 * `signalTree({ count })` is the state argument, not the config, which is the
 * second parameter. Any hand-modelled version of the type system drifts from the
 * real one. tsc is the source of truth, so use tsc.
 *
 * ## Re-baselining
 *
 * Fix errors, then `node tools/check-spec-types.mjs --update` to ratchet down.
 * The count may only ever decrease.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASELINE = new URL('./spec-type-baseline.json', import.meta.url);
const PROJECT = 'tsconfig.typecheck-specs.json';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run() {
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', PROJECT], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (e) {
    // tsc exits non-zero when it reports diagnostics; that is the normal path.
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

/** file -> error count, from tsc's `path(line,col): error TSxxxx:` lines. */
function countsFrom(output) {
  const counts = {};
  for (const line of output.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error TS\d+:/.exec(line);
    if (!m) continue;
    const file = m[1].replace(`${ROOT}/`, '');
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

const output = run();
if (/error TS(5\d{3}|6\d{3})/.test(output) && !/error TS\d+:/.test(output)) {
  console.error('check-spec-types: tsc could not load the project.\n' + output);
  process.exit(2);
}

const actual = countsFrom(output);
const actualTotal = Object.values(actual).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        total: actualTotal,
        files: Object.fromEntries(Object.entries(actual).sort()),
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `check-spec-types: baseline written — ${actualTotal} error(s) across ${
      Object.keys(actual).length
    } file(s).`
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(
    'check-spec-types: no baseline. Run `node tools/check-spec-types.mjs --update`.'
  );
  process.exit(2);
}

const regressions = [];
const improvements = [];
for (const [file, count] of Object.entries(actual)) {
  const allowed = baseline.files[file] ?? 0;
  if (count > allowed) regressions.push({ file, count, allowed });
}
for (const [file, allowed] of Object.entries(baseline.files)) {
  const count = actual[file] ?? 0;
  if (count < allowed) improvements.push({ file, count, allowed });
}

if (regressions.length) {
  console.error(
    `check-spec-types: ${regressions.length} spec file(s) got WORSE.\n` +
      `A new type error in a spec usually means the spec's premise no longer\n` +
      `compiles as written — the shape that let a renamed config option pass\n` +
      `silently and made an assertion vacuous.\n`
  );
  for (const r of regressions) {
    console.error(
      `  ${r.file}: ${r.count} error(s), baseline allows ${r.allowed}`
    );
  }
  console.error('\nFull tsc output:\n');
  console.error(
    output
      .split('\n')
      .filter((l) => regressions.some((r) => l.includes(r.file)))
      .join('\n')
  );
  process.exit(1);
}

if (improvements.length) {
  console.log(
    `check-spec-types: OK — and ${improvements.length} file(s) improved. ` +
      `Ratchet down with \`node tools/check-spec-types.mjs --update\`:`
  );
  for (const i of improvements) {
    console.log(`  ${i.file}: ${i.count} now, baseline ${i.allowed}`);
  }
  process.exit(0);
}

console.log(
  `check-spec-types: OK — ${actualTotal} known error(s) across ` +
    `${Object.keys(actual).length} file(s), none worse than baseline. ` +
    `Spec files ARE typechecked; a renamed public config option fails here.`
);
process.exit(0);
