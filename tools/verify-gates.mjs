#!/usr/bin/env node
/**
 * Runs every gate — and, with `--self-test`, PROVES each one can fail.
 *
 * ## Why this exists
 *
 * Seven times in this repo a gate passed while covering nothing:
 *
 *   1. `grep "Failed tasks"` exited 0 because grep finding nothing IS exit 1,
 *      inverted by a pipeline;
 *   2. pre-publish validation passed having checked 5 of 7 packages;
 *   3. `typecheck` passed reading only the typing specs, never the sources;
 *   4. a property test passed while the code under it dropped data;
 *   5. a benchmark published SignalTree as 20x faster than elf while SignalTree
 *      was idle and doing no work at all;
 *   6. a granularity timing "measured" granularity with a loop that forced every
 *      consumer to re-read, which flatters the LEAST granular store;
 *   7. `verify-publish-artifacts` exits 1 with a usage message when given no
 *      arguments — indistinguishable, to a shell `&&` chain, from a real failure,
 *      and equally indistinguishable from success had the polarity been reversed.
 *
 * Every one of those was green. The lesson is not "write better gates", it is
 * that **a passing gate is evidence of nothing unless it is known to be capable
 * of failing.** So this harness does not ask a gate whether it passed. It breaks
 * the exact thing the gate claims to watch, runs it, and requires a non-zero
 * exit. A gate that stays green against its own mutation is reported as BROKEN
 * even though it "passed".
 *
 * ## Honest coverage
 *
 * Realisation 15 in design-thesis-and-benchmarking-rules.md: a gate must report
 * what it COVERED, not just that it passed. So the summary counts proven gates
 * against total gates and names every unproven one. A gate with no mutation
 * defined is not a silent gap — it is printed, every run, as UNPROVEN.
 *
 * ## Usage
 *
 *   node tools/verify-gates.mjs               # run every gate, fail on any failure
 *   node tools/verify-gates.mjs --self-test   # prove each gate can fail
 *   node tools/verify-gates.mjs --fast        # skip gates marked slow
 *   node tools/verify-gates.mjs --only=name,name
 *   node tools/verify-gates.mjs --list
 *
 * Mutations are applied to a file, then restored in a `finally` and verified
 * byte-for-byte against a hash taken before the mutation. If any file cannot be
 * restored the harness aborts loudly rather than leaving a mutated tree behind.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `needsBuild` marks a gate that reads `dist/`. Its mutation therefore targets a
 * BUILT file, not a source file — mutating the source would leave the gate
 * reading a stale artifact and passing, which would make the self-test itself
 * the eighth entry on the list above. Built files are regenerable, so mutating
 * them is safe; sources are restored by hash regardless.
 */
const GATES = [
  {
    name: 'typecheck',
    covers: 'core sources AND typing specs compile (both projects, not just one)',
    cmd: ['npm', 'run', 'typecheck'],
    slow: true,
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nconst __gateMutation: number = "not a number";\n',
    },
  },
  {
    name: 'test:all',
    covers: 'behaviour across ALL 8 published packages, not just core',
    // Was `nx test core`. The gate's own name said "core" and its summary line
    // said "core behaviour", so it was honest about what it covered — and what
    // it covered was one package of eight. The other seven have real suites
    // (ng-forms alone has 44) and nothing in the gate suite ran them.
    cmd: [
      'npx', 'nx', 'run-many', '-t', 'test',
      '--projects=core,enterprise,ng-forms,shared,guardrails,schema,events,realtime',
      '--skip-nx-cache',
    ],
    slow: true,
    // Breaking the memo makes the wrapper churn again — marker-snapshot-memo.spec
    // must catch it. Chosen over a trivially-broken function because it targets a
    // fix whose whole risk is that it is INVISIBLE when it regresses.
    mutation: {
      file: 'packages/core/src/lib/internals/materialize-markers.ts',
      find: '  let memo = SNAPSHOT_MEMO.get(node as object);\n  if (!memo) {',
      replace: '  let memo = undefined as Signal<{ value: unknown }> | undefined;\n  if (!memo) {',
    },
  },
  {
    name: 'lint:budget',
    covers: 'eslint errors across all 9 projects, AND warnings never grow',
    // Replaces a bare `npm run lint:all`, which this harness caught passing
    // while an unused `any`-typed function sat in core: lint reported it as a
    // warning and exited 0, because nothing passes --max-warnings. 577 warnings
    // exist, so --max-warnings 0 is not available; the budget ratchets instead.
    cmd: ['node', 'tools/check-lint-budget.mjs'],
    slow: true,
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nexport function __gateMutation(x: any) { return x; }\n',
    },
  },
  {
    name: 'built-barrels',
    covers: 'every source export survives into the built barrel',
    cmd: ['node', 'tools/verify-built-barrels.mjs'],
    needsBuild: true,
    mutation: {
      file: 'dist/packages/core/dist/index.js',
      find: 'export { signalTree }',
      replace: 'export { signalTree as signalTreeRenamedByGateSelfTest }',
    },
  },
  {
    name: 'devmode-foldable',
    covers: 'diagnostics fold away when a consumer defines ngDevMode=false',
    cmd: ['node', 'tools/check-devmode-foldable.mjs'],
    needsBuild: true,
    // No mutation: the gate builds its own fixtures with esbuild and asserts on
    // the OUTPUT, so there is no single input file whose corruption it must
    // catch. Proving it would mean shipping a deliberately unfoldable fixture
    // through the same pipeline — worth doing, not yet done.
    unproven: 'asserts on a bundle it builds itself; needs a fixture, not a file mutation',
  },
  {
    name: 'guardrails-exports',
    covers: 'guardrails resolves to the noop build under the production condition',
    cmd: ['node', 'scripts/verify-guardrails-default-condition.mjs'],
    needsBuild: true,
    mutation: {
      file: 'dist/packages/guardrails/package.json',
      find: '"production": {\n        "import": "./dist/noop.js"',
      replace: '"production": {\n        "import": "./dist/index.js"',
    },
  },
  {
    name: 'lint:skills',
    covers: 'code blocks in docs/skills/** use APIs that exist',
    cmd: ['node', 'scripts/lint-skills.mjs'],
    mutation: {
      file: 'docs/skills/using-signaltree/SKILL.md',
      append:
        '\n```ts\nimport { signalTree } from "@signaltree/core";\nconst t = signalTree({ n: 0 });\nt.$.n.thisApiDoesNotExist();\n```\n',
    },
  },
  {
    name: 'taught-symbols',
    covers: 'llms-full.txt teaches no removed API, and every golden symbol is taught',
    cmd: ['node', 'scripts/verify-taught-symbols.js'],
    needsBuild: true,
    // Was run by CI and by nothing else. A dead API in the AI-facing doc is the
    // hallucination vector this repo cares most about.
    mutation: {
      file: 'apps/demo/public/llms-full.txt',
      append: '\n```ts\nimport { thisApiWasNeverReal } from "@signaltree/core";\n```\n',
    },
  },
  {
    name: 'angular-compat',
    covers: 'no Angular API newer than the ^20 floor is imported as a VALUE',
    cmd: ['node', 'tools/check-angular-compat.mjs'],
    needsBuild: true,
    // The repo's own Angular is 22, so an accidental value-import of Signal
    // Forms would build, test and publish green while breaking every Angular 20
    // consumer at import time.
    // Mutating the /signals entry proves nothing — it is ALLOWED to use Signal
    // Forms. The regression that matters is the MAIN entry reaching it, which
    // is what breaks an Angular 20 consumer who never touched /signals.
    mutation: {
      file: 'dist/packages/ng-forms/dist/core/ng-forms.js',
      append: "\nexport { form as __gateLeak } from '@angular/forms/signals';\n",
    },
  },
  {
    name: 'version-claims',
    covers: 'every documented Angular-version claim matches peerDependencies',
    cmd: ['node', 'scripts/verify-version-claims.js'],
    mutation: {
      file: 'packages/core/package.json',
      find: '"@angular/core": "^20.0.0 || ^21.0.0 || ^22.0.0"',
      replace: '"@angular/core": "^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0"',
    },
  },
  {
    name: 'package-hygiene',
    covers: 'no junk in any tarball, and every declared entry is present',
    cmd: ['node', 'scripts/verify-package-hygiene.js'],
    needsBuild: true,
    unproven: 'inspects packed tarballs; a mutation would need a fixture package',
  },
  {
    name: 'readme-apis',
    covers: 'every @signaltree symbol named in a shipped README exists',
    cmd: ['node', 'scripts/lint-readme-apis.mjs'],
    needsBuild: true,
    // READMEs ship inside the tarball. A user's first action is copying an
    // import out of one, and nothing checked that the symbol existed: the first
    // run found 13 dead references across four packages.
    mutation: {
      file: 'packages/core/README.md',
      append:
        "\n```ts\nimport { thisSymbolDoesNotExist } from '@signaltree/core';\n```\n",
    },
  },
  {
    name: 'dead-exports',
    covers: 'no NEW export is unreachable from every entry point and every import',
    // Ratcheted to ZERO: the 42 leads were triaged to nothing, so any new
    // unreachable export is a regression rather than one more on a pile.
    cmd: ['node', 'tools/find-dead-exports.mjs', '--max=0'],
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nexport const __gateUnreachableExport = 1;\n',
    },
  },
  {
    name: 'demo-coverage',
    covers: 'every ROOT-barrel export is demonstrated in the demo app',
    cmd: ['node', 'tools/check-demo-coverage.mjs'],
    needsBuild: true,
    // Adding a root export with no demo must fail. This is the stronger of the
    // two reachability checks: dead-exports asks whether anything IMPORTS a
    // symbol, this asks whether anything SHOWS it to a person.
    mutation: {
      file: 'dist/packages/core/dist/index.js',
      append: '\nexport const __gateUndemoedExport = 1;\n',
    },
  },
  {
    name: 'dead-exports:self',
    covers: 'the reachability scan itself is neither too narrow nor too broad',
    cmd: ['node', 'tools/find-dead-exports.mjs', '--self-test'],
    // Narrowing reachability makes a PUBLIC symbol look dead, which is the
    // failure that shipped once (five published guardrails factories).
    mutation: {
      file: 'tools/find-dead-exports.mjs',
      find: "  for (const [subpath, value] of Object.entries(manifest.exports ?? { '.': {} })) {",
      replace:
        "  for (const [subpath, value] of Object.entries(manifest.exports ?? { '.': {} })) {\n    if (subpath !== '.') continue;",
    },
  },
  // ── Measurement harnesses ────────────────────────────────────────────────
  // These gate on the HARNESS still working, not on its numbers. Timings move
  // with the machine, so asserting them would make the suite flaky and teach
  // people to ignore it; what rots silently is the harness itself — an arm that
  // stops constructing, a postcondition whose API moved. Run at smoke sizes
  // (1.5s rather than minutes); the published numbers come from a full run.
  {
    name: 'bench-harness',
    covers: 'all 4 benchmark arms construct, run, and satisfy their postconditions',
    cmd: ['node', '--expose-gc', 'tools/bench-compare.mjs', '--n', '200'],
    needsBuild: true,
    // The postconditions live in the child. Breaking the undo call makes the
    // signaltree arm restore nothing — exactly the idle-arm bug that was
    // published once as "20x faster than elf".
    mutation: {
      file: 'tools/bench-compare.mjs',
      find: '      impl.undo();',
      replace: '      void impl;',
    },
  },
  {
    name: 'memory-harness',
    covers: 'every memory scenario runs under forced GC and reports collectability',
    cmd: ['node', '--expose-gc', 'tools/memory-report.mjs'],
    needsBuild: true,
    // Removing --expose-gc from the child would measure allocation instead of
    // retention — the error already on record at 8x.
    mutation: {
      file: 'tools/memory-report.mjs',
      find: "    ['--expose-gc', new URL(import.meta.url).pathname, '--scenario', name],",
      replace: "    [new URL(import.meta.url).pathname, '--scenario', name],",
    },
  },
  {
    name: 'memory-compare',
    covers: 'all 4 cross-library memory arms construct and measure a marginal slope',
    cmd: ['node', '--expose-gc', 'tools/memory-compare.mjs', '--n', '1000'],
    needsBuild: true,
    // Anchored on the child's dispatch, NOT on its unknown-arm branch: the
    // first attempt injected a throw into `if (!build)`, which never executes
    // for a valid arm, so the mutation ran nothing and the gate looked blind
    // when it was the mutation that was inert.
    mutation: {
      file: 'tools/memory-compare.mjs',
      find: '  const build = ARMS[name];',
      replace: "  const build = name === 'elf' ? null : ARMS[name];",
    },
  },
  {
    name: 'state-scale',
    covers: 'the O(1)-write thesis, measured against elf on both axes',
    cmd: ['node', 'tools/bench-state-scale.mjs', '--quick'],
    needsBuild: true,
    // Every arm asserts its write landed. Breaking the signaltree write makes
    // the postcondition fire — the check that the benchmark is not measuring an
    // idle arm, which this repo has published once already.
    mutation: {
      file: 'tools/bench-state-scale.mjs',
      find: '    for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);\n  });\n\n  const store = createStore({ name: `flat${size}` }',
      replace: '    for (let w = 0; w < WRITES; w++) void w;\n  });\n\n  const store = createStore({ name: `flat${size}` }',
    },
  },
  {
    name: 'size-compare',
    covers: 'cross-library gzip cost is measurable for both libraries',
    cmd: ['node', 'tools/size-compare.mjs'],
    needsBuild: true,
    unproven: 'reports sizes; no threshold to breach — the budget gate owns ours',
  },
  {
    name: 'size-report',
    covers: 'every published package builds and its tree-shaken size is measurable',
    cmd: ['node', 'tools/size-report.mjs'],
    needsBuild: true,
    unproven: 'reports sizes; the budget assertion lives in bundle-budget below',
  },
  {
    name: 'publish-artifacts',
    covers: 'every declared `files` entry of every package resolves in dist',
    cmd: ['node', 'scripts/prepare-publish-artifacts.mjs'],
    needsBuild: true,
    // npm does NOT warn when a `files` glob matches nothing — the tarball just
    // ships light. Removing a real entry's source must fail here, because
    // nothing downstream will notice.
    mutation: {
      file: 'dist/packages/core/package.json',
      find: '"files": [',
      replace: '"files": [\n    "this-entry-matches-nothing/**/*",',
    },
  },
  {
    name: 'bundle-budget',
    covers: 'built package sizes stay inside their budgets',
    cmd: ['node', 'tools/check-bundle-budget.mjs'],
    needsBuild: true,
    // Appends statically-reachable, incompressible code to the built barrel.
    // Reachable, because a tree-shaken bundle drops anything else; incompressible,
    // because gzip flattens a repeated string to nothing and the budget would
    // not move. Assigning through globalThis is what defeats the shaker.
    mutation: {
      file: 'dist/packages/core/dist/index.js',
      generate: (original) => {
        const parts = [];
        for (let i = 0; i < 900; i++) {
          parts.push(`gateBloat_${i.toString(36)}_${(i * 2654435761) % 1e9}`);
        }
        return `${original}\nglobalThis.__gateBloat = ${JSON.stringify(parts)};\n`;
      },
    },
  },
];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

if (has('--list')) {
  for (const g of GATES) {
    console.log(
      `${g.name.padEnd(20)} ${g.mutation ? 'provable' : 'UNPROVEN'}  ${g.covers}`
    );
  }
  process.exit(0);
}

const selected = GATES.filter(
  (g) => (!only || only.includes(g.name)) && !(has('--fast') && g.slow)
);

function run(gate) {
  try {
    execFileSync(gate.cmd[0], gate.cmd.slice(1), {
      cwd: ROOT,
      stdio: 'pipe',
      env: process.env,
    });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

const hash = (s) => createHash('sha256').update(s).digest('hex');

/** Apply, run, restore. Restoration is verified, not assumed. */
function withMutation(mutation, fn) {
  const path = join(ROOT, mutation.file);
  if (!existsSync(path)) throw new Error(`mutation target missing: ${mutation.file}`);
  const original = readFileSync(path, 'utf8');
  const before = hash(original);

  let mutated;
  if (mutation.generate) {
    // For mutations that cannot be written as a literal — the bundle-budget one
    // needs INCOMPRESSIBLE bytes, since a repeated string gzips to nothing and
    // would leave the budget unmoved, i.e. an inert mutation masquerading as a
    // blind gate.
    mutated = mutation.generate(original);
  } else if (mutation.append) {
    mutated = original + mutation.append;
  } else {
    if (!original.includes(mutation.find)) {
      throw new Error(
        `mutation anchor not found in ${mutation.file} — the gate's target moved, ` +
          `so this self-test has been silently testing nothing. Fix the anchor.`
      );
    }
    mutated = original.replace(mutation.find, mutation.replace);
  }
  if (mutated === original) throw new Error(`mutation was a no-op in ${mutation.file}`);

  try {
    writeFileSync(path, mutated);
    return fn();
  } finally {
    writeFileSync(path, original);
    if (hash(readFileSync(path, 'utf8')) !== before) {
      console.error(`\n  FATAL: could not restore ${mutation.file}. Tree is dirty.`);
      process.exit(2);
    }
  }
}

const results = [];

if (has('--self-test')) {
  console.log(`\nGate self-test — each gate must FAIL against its own mutation\n`);
  for (const gate of selected) {
    if (!gate.mutation) {
      results.push({ gate, state: 'unproven' });
      console.log(`  ~ ${gate.name.padEnd(20)} UNPROVEN — ${gate.unproven}`);
      continue;
    }
    process.stdout.write(`  · ${gate.name.padEnd(20)} mutating ${gate.mutation.file} ... `);
    let code;
    try {
      code = withMutation(gate.mutation, () => run(gate));
    } catch (err) {
      results.push({ gate, state: 'error' });
      console.log(`ERROR\n      ${err.message}`);
      continue;
    }
    if (code !== 0) {
      results.push({ gate, state: 'proven' });
      console.log(`caught it (exit ${code}) ✓`);
    } else {
      results.push({ gate, state: 'blind' });
      console.log(
        `\n      BLIND: the gate passed while its own target was broken.\n` +
          `      It covers: ${gate.covers}\n` +
          `      Right now it covers nothing.`
      );
    }
  }
} else {
  console.log(`\nRunning ${selected.length} gates\n`);
  for (const gate of selected) {
    process.stdout.write(`  · ${gate.name.padEnd(20)} `);
    const code = run(gate);
    const ok = code === 0;
    results.push({ gate, state: ok ? 'pass' : gate.knownFailing ? 'known' : 'fail' });
    console.log(
      ok
        ? `pass ✓  (${gate.covers})`
        : gate.knownFailing
          ? `RED, known ✗  ${gate.knownFailing}`
          : `FAIL (exit ${code}) ✗  ${gate.covers}`
    );
  }
}

// ── Summary: what was covered, not merely that it passed ────────────────────
const count = (s) => results.filter((r) => r.state === s).length;
console.log(`\n${'─'.repeat(78)}`);

if (has('--self-test')) {
  const proven = count('proven');
  console.log(
    `${proven}/${selected.length} gates PROVEN able to fail. ` +
      `${count('unproven')} unproven, ${count('blind')} blind, ${count('error')} errored.`
  );
  for (const r of results.filter((r) => r.state === 'unproven')) {
    console.log(`  unproven: ${r.gate.name} — ${r.gate.unproven}`);
  }
  for (const r of results.filter((r) => r.state === 'blind')) {
    console.log(`  BLIND:    ${r.gate.name} — passed while broken`);
  }
  const bad = count('blind') + count('error');
  process.exit(bad > 0 ? 1 : 0);
} else {
  console.log(
    `${count('pass')}/${selected.length} passed, ` +
      `${count('fail')} failed, ${count('known')} known-red.`
  );
  if (has('--fast')) {
    const skipped = GATES.filter((g) => g.slow).map((g) => g.name);
    console.log(`  --fast SKIPPED: ${skipped.join(', ')} — this run did not cover them.`);
  }
  process.exit(count('fail') > 0 ? 1 : 0);
}
