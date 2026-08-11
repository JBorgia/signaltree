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
 *   node tools/verify-gates.mjs --release     # include the measurement harnesses
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
    covers:
      'core sources AND typing specs compile (both projects, not just one)',
    cmd: ['npm', 'run', 'typecheck'],
    slow: true,
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nconst __gateMutation: number = "not a number";\n',
    },
  },
  {
    name: 'test:all',
    covers: 'behaviour across all 6 published packages AND the demo app',
    // Was `nx test core`. The gate's own name said "core" and its summary line
    // said "core behaviour", so it was honest about what it covered — and what
    // it covered was one package of eight. The other seven have real suites
    // (ng-forms alone has 44) and nothing in the gate suite ran them.
    cmd: [
      'npx',
      'nx',
      'run-many',
      '-t',
      'test',
      // The demo has 27 suites and 191 tests that ran only if someone typed
      // `nx test demo` by hand. It is also the app the demo-coverage gate holds
      // up as proof every export is demonstrated — so it breaking silently would
      // undermine that gate too.
      '--projects=core,ng-forms,shared,guardrails,schema,events,realtime,demo',
      '--skip-nx-cache',
    ],
    slow: true,
    // Breaking the memo makes the wrapper churn again — marker-snapshot-memo.spec
    // must catch it. Chosen over a trivially-broken function because it targets a
    // fix whose whole risk is that it is INVISIBLE when it regresses.
    mutation: {
      file: 'packages/core/src/lib/internals/materialize-markers.ts',
      find: '  let memo = SNAPSHOT_MEMO.get(node as object);\n  if (!memo) {',
      replace:
        '  let memo = undefined as Signal<{ value: unknown }> | undefined;\n  if (!memo) {',
    },
  },
  {
    name: 'lint:budget',
    covers: 'eslint errors across all 10 projects, AND warnings never grow',
    // Replaces a bare `npm run lint:all`, which this harness caught passing
    // while an unused `any`-typed function sat in core: lint reported it as a
    // warning and exited 0, because nothing passes --max-warnings. Warnings
    // exist in the hundreds, so --max-warnings 0 is not available; the budget
    // ratchets instead. The live count is printed by the gate itself and is
    // deliberately NOT repeated here — a number duplicated into a comment is a
    // number that goes stale, and this one already did (it said 577 against an
    // actual 746, while check-lint-budget.mjs's own comment said 684).
    cmd: ['node', 'tools/check-lint-budget.mjs'],
    slow: true,
    // A `debugger` statement, because it is an eslint ERROR and errors fail this
    // gate regardless of the warning budget.
    //
    // The mutation was `export function __gateMutation(x: any)`, which adds
    // exactly one `no-explicit-any` WARNING — and a ratchet only fails when a
    // project EXCEEDS its baseline. Two warnings had been paid down without
    // running `--update`, leaving 540 recorded against 538 live, so the single
    // added warning landed inside that headroom and the gate passed while
    // broken. An audit caught it.
    //
    // `no-debugger` does the job: 0 errors/10 warnings becomes 1 error/10.
    //
    // Dropping `export` — the obvious fix — appeared not to work, and the
    // reason is worth more than the fix. Measured:
    //
    //     function __gateMutation(x: any) { … }   0 errors, 11 warnings
    //     function gateMutation(x: any)   { … }   1 ERROR,  11 warnings
    //     const    gateBloat: any = 1;            1 ERROR,  11 warnings
    //
    // `no-unused-vars` is severity 2 and fires perfectly well. It ignored the
    // mutation because this harness names its mutations `__gate*` and the rule
    // is configured with `varsIgnorePattern: '^_'`. THE MUTATION NAMING
    // CONVENTION SILENTLY DISABLED THE RULE THAT WOULD HAVE CAUGHT IT. A first
    // pass concluded from that "the rule does not fire for unused declarations"
    // — a general claim drawn from a fixture carrying an invisible confound,
    // which is the same defect this harness exists to catch, committed while
    // fixing this harness. Corrected by the independent auditor.
    //
    // `debugger` is still the better mutation, but for a different reason than
    // first stated: it is NAME-INDEPENDENT, so no ignore-pattern can absorb it.
    // `check-lint-budget.mjs`'s own header already said "a `debugger` statement
    // in utils.ts does fail it"; the mutation just never used it.
    //
    // The general rule, and the reason this was blind for two days: a proof
    // that depends on a RECORDED NUMBER staying current is only as good as the
    // discipline of whoever last paid a warning down. An error-based mutation
    // cannot be absorbed by slack.
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nfunction __gateMutation() {\n  debugger;\n}\n',
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
    // Proven by its own --self-test gate below: if a tool builds its own
    // inputs, the self-test builds a BAD one.
    provenBy: 'devmode-foldable:self',
  },
  {
    name: 'devmode-foldable:self',
    covers:
      'the foldability checker detects a surviving literal AND a non-shrinking bundle',
    cmd: ['node', 'tools/check-devmode-foldable.mjs', '--self-test'],
    needsBuild: true,
    mutation: {
      file: 'tools/check-devmode-foldable.mjs',
      find: "const WARN_ONLY_CODES = ['ST2001', 'ST2002', 'ST2003', 'ST2007'];",
      replace: 'const WARN_ONLY_CODES = [];',
    },
  },
  {
    name: 'guardrails-exports',
    covers:
      'guardrails resolves to the noop build under the production condition',
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
    covers:
      'llms-full.txt teaches no removed API, and every golden symbol is taught',
    cmd: ['node', 'scripts/verify-taught-symbols.js'],
    needsBuild: true,
    // Was run by CI and by nothing else. A dead API in the AI-facing doc is the
    // hallucination vector this repo cares most about.
    mutation: {
      file: 'apps/demo/public/llms-full.txt',
      append:
        '\n```ts\nimport { thisApiWasNeverReal } from "@signaltree/core";\n```\n',
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
      append:
        "\nexport { form as __gateLeak } from '@angular/forms/signals';\n",
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
    name: 'exports-importable',
    covers: 'every package export can actually be imported',
    cmd: ['node', 'scripts/verify-exports.js'],
    needsBuild: true,
    // Ran nowhere: an npm script nothing invoked, absent from CI. It passed the
    // whole time, which is the only reason that was survivable.
    mutation: {
      file: 'dist/packages/core/package.json',
      find: '"import": "./dist/index.js"',
      replace: '"import": "./dist/does-not-exist.js"',
    },
  },
  {
    name: 'v9-budgets',
    // The dev-code leak check inside this script is WARNING-ONLY by explicit
    // decision ("some are intentional error logs"), so it is deliberately not
    // claimed here. The self-test caught the overclaim: an unguarded
    // console.log appended to the shipped bundle passed.
    covers: 'raw bundle-size ceiling and the public value-export count budget',
    cmd: ['node', 'scripts/v9-budget-checks.js'],
    needsBuild: true,
    mutation: {
      file: 'dist/packages/core/dist/index.js',
      generate: (original) => {
        // Raw bytes, not gzip — this budget measures unminified size, so the
        // padding does not need to be incompressible.
        const pad = 'x'.repeat(40_000);
        return `${original}\nglobalThis.__gateSizePad = ${JSON.stringify(
          pad
        )};\n`;
      },
    },
  },
  {
    name: 'tree-shaking',
    covers: 'an unused enhancer does not survive into a consumer bundle',
    cmd: ['node', 'scripts/test-tree-shaking.js'],
    needsBuild: true,
    provenBy: 'tree-shaking:self',
  },
  {
    name: 'tree-shaking:self',
    covers:
      'the tree-shaking checker detects code pulling in a forbidden module',
    cmd: ['node', 'scripts/test-tree-shaking.js', '--self-test'],
    needsBuild: true,
    // Targets the DETECTION, not the reporting. A first attempt replaced the
    // exit code with a constant 0, which is tautological — breaking how a check
    // reports proves nothing about whether it can see anything. Emptying the
    // forbidden list means the planted case no longer trips detection, which is
    // the failure that matters.
    mutation: {
      file: 'scripts/test-tree-shaking.js',
      find: "  shouldNotInclude: ['devtools'],\n};",
      replace: '  shouldNotInclude: [],\n};',
    },
  },
  {
    name: 'sanity',
    covers: 'workspace smoke/parity checks',
    cmd: ['node', 'scripts/sanity-checks.js'],
    needsBuild: true,
    // Four file-exists/contains greps. Largely redundant — if signal-tree.ts
    // went missing, typecheck, build and 1,500 tests would all fail long before
    // a string grep did — but it costs ~0.2s and it can now prove itself.
    // Retargeted when @signaltree/enterprise was removed in 14.0.0 — the file
    // this used to mutate no longer exists, and a missing anchor is a hard error
    // rather than a silent skip, which is how it surfaced immediately.
    mutation: {
      file: 'packages/core/src/enhancers/batching/batching.ts',
      generate: (original) =>
        original.replace(/batching/g, 'renamedByGateSelfTest'),
    },
  },
  {
    name: 'package-hygiene',
    covers: 'no junk in any tarball, and every declared entry is present',
    cmd: ['node', 'scripts/verify-package-hygiene.js'],
    needsBuild: true,
    provenBy: 'package-hygiene:self',
  },
  {
    name: 'package-hygiene:self',
    covers: 'the hygiene checker flags junk and a missing required entry',
    cmd: ['node', 'scripts/verify-package-hygiene.js', '--self-test'],
    needsBuild: true,
    mutation: {
      file: 'scripts/verify-package-hygiene.js',
      find: "  { re: /\\.spec\\./, why: 'test spec' },",
      replace: '',
    },
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
    covers:
      'no NEW export is unreachable from every entry point and every import',
    // Ratcheted to ZERO: the 42 leads were triaged to nothing, so any new
    // unreachable export is a regression rather than one more on a pile.
    cmd: ['node', 'tools/find-dead-exports.mjs', '--max=0'],
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nexport const __gateUnreachableExport = 1;\n',
    },
  },
  {
    name: 'numeric-claims',
    covers:
      'every measured figure on a live surface names a tool that produces it — ratcheted, so new ungenerated numbers cannot land',
    cmd: ['node', 'tools/check-numeric-claims.mjs'],
    provenBy: 'numeric-claims:self',
  },
  {
    name: 'numeric-claims:self',
    covers:
      'the numeric-claims scanner detects a figure in a section that names no generator, and clears it once one is named',
    cmd: ['node', 'tools/check-numeric-claims.mjs', '--self-test'],
    // Every other `:self` gate mutates its own CHECKER; this one shipped with no
    // mutation at all, so the harness marked it `unproven` and SKIPPED it — and
    // then credited `numeric-claims` as "proven via numeric-claims:self", a
    // proof by a gate that never ran. Blinding the CLAIM pattern makes the
    // scanner see no figures, so its self-test can no longer detect the
    // ungenerated one it plants.
    mutation: {
      file: 'tools/check-numeric-claims.mjs',
      find: 'const CLAIM =',
      replace: 'const CLAIM = /(?!)/g; const __unusedClaim =',
    },
  },
  {
    name: 'release-claims',
    covers:
      'every symbol/code ADDED since the last release tag reaches every surface that claims to describe the library',
    // The one gate that runs API -> claim. Every other one runs claim -> API,
    // which cannot see a capability that shipped and was never written up:
    // you can grep for a symbol a doc names, not for one it fails to name.
    // Two things got through that blind spot in this release alone — the
    // AI-priming surfaces (`49dd9ffb`, found by hand) and the capability
    // matrix, which still carried ❌ for five capabilities the same release
    // shipped and had been edited TWICE after they landed.
    cmd: ['node', 'tools/check-release-claims.mjs'],
    // Deleting a shipped capability from the priming file must fail. Chosen
    // over a synthetic export because it reproduces the ACTUAL defect: the API
    // is fine, the claim surface is the thing that went stale.
    mutation: {
      file: 'apps/demo/public/llms.txt',
      find: 'prependOne',
      replace: '__gateRemovedFromPriming',
    },
  },
  {
    name: 'demo-coverage',
    covers:
      'every ROOT-barrel export is demonstrated in the demo app — NOT node methods, /authoring exports or types, which release-claims covers',
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
    releaseOnly: true,
    covers:
      'all 4 benchmark arms construct, run, and satisfy their postconditions',
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
    releaseOnly: true,
    covers:
      'every memory scenario runs under forced GC and reports collectability',
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
    releaseOnly: true,
    covers:
      'all 4 cross-library memory arms construct and measure a marginal slope',
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
    releaseOnly: true,
    covers:
      'the O(1)-write thesis, measured against @ngrx/signals and elf on both axes',
    cmd: ['node', 'tools/bench-state-scale.mjs', '--quick'],
    needsBuild: true,
    // Every arm asserts its write landed. Breaking the signaltree write makes
    // the postcondition fire — the check that the benchmark is not measuring an
    // idle arm, which this repo has published once already.
    mutation: {
      file: 'tools/bench-state-scale.mjs',
      find: '    for (let w = 0; w < WRITES; w++) tree.$.k0.v.set(w);\n  });\n\n  const store = createStore({ name: `flat${size}` }',
      replace:
        '    for (let w = 0; w < WRITES; w++) void w;\n  });\n\n  const store = createStore({ name: `flat${size}` }',
    },
  },
  {
    name: 'raw-signals',
    releaseOnly: true,
    covers:
      'the "why not raw signals" arms construct, interleave, and their postconditions fire',
    cmd: [
      'node',
      'tools/bench-raw-signals.mjs',
      '--writes',
      '5000',
      '--consumers',
      '10',
    ],
    needsBuild: true,
    // Every arm asserts its write landed (SENTINEL). Breaking the raw write
    // makes the postcondition fire — the guardrail against an idle arm, and
    // against the arm-order contamination this tool's first draft shipped.
    mutation: {
      file: 'tools/bench-raw-signals.mjs',
      find: '  for (let i = 0; i < WRITES; i++) field.set(i + round * WRITES);\n  const ns = Number(process.hrtime.bigint() - t) / WRITES;\n  sink += field();',
      replace:
        '  for (let i = 0; i < WRITES; i++) void (i + round * WRITES);\n  const ns = Number(process.hrtime.bigint() - t) / WRITES;\n  sink += field();',
    },
  },
  {
    name: 'size-compare',
    releaseOnly: true,
    covers: 'cross-library gzip cost is measurable for both libraries',
    cmd: ['node', 'tools/size-compare.mjs'],
    needsBuild: true,
    // It printed ERROR for a failed build and exited 0 until now — the same
    // defect bench-compare and memory-compare had. A size claim published from
    // a table with the inconvenient row silently missing is the risk.
    mutation: {
      file: 'tools/size-compare.mjs',
      find: "  import { createStore, withProps, select } from '@ngneat/elf';",
      replace:
        "  import { nothing } from '@ngneat/this-package-does-not-exist';",
    },
  },
  {
    name: 'size-report',
    releaseOnly: true,
    covers:
      'every published package builds and its tree-shaken size is measurable',
    cmd: ['node', 'tools/size-report.mjs'],
    needsBuild: true,
    // It refuses to report against a missing build rather than printing zeros,
    // which is the failure mode that matters for a REPORTER: a size table built
    // from nothing looks like a very good result.
    mutation: {
      file: 'dist/packages/core/dist/index.js',
      generate: () => '',
    },
  },
  {
    name: 'error-codes',
    covers:
      'every diagnostic code the packages can emit is in docs/errors/README.md, and the catalogue invents none',
    cmd: ['node', 'tools/check-error-codes.mjs'],
    // Was short by two when written: ST1031 and ST1032 were emittable and
    // documented nowhere. The earlier sweep missed them because it compared
    // COUNTS on the ST2xxx series (27 vs 27) instead of comparing the sets.
    mutation: {
      file: 'docs/errors/README.md',
      find: '| ST1031 |',
      replace: '| ST9999 |',
    },
  },
  {
    name: 'error-codes:self',
    covers:
      'the catalogue checker detects a removed code AND reports the catalogue in sync without the probe',
    cmd: ['node', 'tools/check-error-codes.mjs', '--self-test'],
    // Blind the code pattern. The scanner then finds no codes at all, so its
    // self-test cannot notice the one it deletes from the catalogue — a
    // `:self` gate with no mutation is skipped, and the harness would credit
    // `error-codes` as "proven via error-codes:self" on a proof that never ran.
    mutation: {
      file: 'tools/check-error-codes.mjs',
      find: 'const CODE =',
      replace: 'const CODE = /(?!)/g; const __unusedCode =',
    },
  },
  {
    name: 'declaration-docs',
    covers:
      'a package whose source carries JSDoc ships JSDoc in its shipped .d.ts',
    cmd: ['node', 'tools/check-declaration-docs.mjs'],
    needsBuild: true,
    // Five of seven packages shipped declarations with ZERO JSDoc, because
    // `removeComments: true` is the only TS switch for keeping comments out of
    // emitted JS and it strips `.d.ts` too. core/src/lib/types.ts carried 476
    // JSDoc lines and its shipped types.d.ts carried 0, so a consumer hovering
    // `maxHistorySize` got no description and no `@default 50`. Nothing caught
    // it: bundle-budget measures bundled JS, api-surface compares symbol names,
    // package-hygiene checks presence. Comments now stay in both outputs and the
    // strip plugin in tools/build/create-rollup-config.mjs removes them from JS.
    //
    // `generate`, not find/replace: the harness replaces the FIRST match only,
    // so blinding one `/**` of the 106 in this file left the package at 86%
    // retained and the gate green. Emptying it drops guardrails to ~12%.
    mutation: {
      file: 'dist/packages/guardrails/src/lib/types.d.ts',
      generate: () => '',
    },
  },
  {
    name: 'declaration-docs:self',
    covers:
      'the declaration-docs checker flags a stripped declaration set AND reports clean at the real ratio',
    cmd: ['node', 'tools/check-declaration-docs.mjs', '--self-test'],
    needsBuild: true,
    // Blind the JSDoc counter. Every package then reports zero source blocks, so
    // the self-test has no documented package to probe with and must refuse to
    // run rather than pass vacuously — otherwise `declaration-docs` gets
    // credited on a proof that never happened.
    mutation: {
      file: 'tools/check-declaration-docs.mjs',
      find: '(text.match(/\\/\\*\\*/g) ?? []).length',
      replace: '0',
    },
  },
  {
    name: 'api-surface',
    covers:
      'the entry-point inventory in llms.txt, llms-full.txt, the SKILL and core README matches the BUILT barrels',
    cmd: ['node', 'tools/gen-api-surface.mjs', '--check'],
    needsBuild: true,
    // The inventory used to be hand-written in four places. It drifted: the
    // SKILL claimed "25 symbols MOVED there" and then enumerated fewer, and six
    // /authoring exports were documented on no surface at all. Editing a managed
    // region by hand must fail, because that is the drift returning.
    mutation: {
      file: 'docs/skills/using-signaltree/SKILL.md',
      find: '<!-- END GENERATED: api-entry-points -->',
      replace:
        'and one more symbol nobody added.\n<!-- END GENERATED: api-entry-points -->',
    },
  },
  {
    name: 'doc-links',
    covers:
      'every relative link resolves AND every install instruction names a publishable package (archive/CHANGELOG excluded as point-in-time)',
    cmd: ['node', 'tools/check-doc-links.mjs'],
    // A link is a claim about the repository. 28 were broken when this landed,
    // five of them in files that ship inside the npm tarballs — where a README
    // is immutable for the life of a published version. `readme-apis` checks
    // that every SYMBOL a README names exists; nothing checked that a PATH did.
    mutation: {
      file: 'docs/README.md',
      generate: (original) =>
        `${original}\n\n[gate mutation](./__no_such_doc_4b1e__.md)\n`,
    },
  },
  {
    name: 'doc-links:self',
    covers:
      'the link checker flags a missing target AND reports the repo clean without one',
    cmd: ['node', 'tools/check-doc-links.mjs', '--self-test'],
    // Make every target look resolvable. The self-test then plants a link to a
    // missing file and sees nothing wrong, which is exactly the failure a
    // `:self` gate exists to rule out.
    mutation: {
      file: 'tools/check-doc-links.mjs',
      find: 'ok: existsSync(resolved),',
      replace: 'ok: true,',
    },
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
    // Appends statically-reachable, incompressible code to a SOURCE file that
    // every measured entry pulls in transitively.
    //
    // It targeted the BUILT barrel (`dist/.../index.js`) and was BLIND: the gate
    // gained an `ensureBuilt()` that rebuilds `dist/` before measuring, so it
    // erased its own mutation and then measured a clean bundle. The gate passed
    // while its target was broken — found by an independent audit.
    //
    // Three properties, and the mutation needs all three. MEASURED, each shape
    // run against the real gate:
    //
    //   (globalThis as any).__gateBloat = [...]   exit 1, BUDGET  13.69/5.9KB  ✅
    //   export const __gateBloat = [...]          exit 0, tree-shaken away     ❌
    //   globalThis.__gateBloat = [...]            exit 1, BUILD fails (TS7017) ❌
    //
    // - SIDE-EFFECTING, not an export: esbuild keeps a top-level assignment and
    //   drops an unreferenced export entirely.
    // - INCOMPRESSIBLE: gzip flattens a repeated string and the budget would not
    //   move.
    // - VALID TYPESCRIPT: `globalThis.__gateBloat` is TS7017 in a `.ts` file, so
    //   the bare form fails the BUILD instead of the BUDGET. That still exits 1,
    //   and this harness counts any non-zero exit as proven — which would have
    //   left the gate "proven" by a check of the compiler, not of the budget.
    //   The cast is what makes the proof mean what it says.
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      generate: (original) => {
        const parts = [];
        for (let i = 0; i < 900; i++) {
          parts.push(`gateBloat_${i.toString(36)}_${(i * 2654435761) % 1e9}`);
        }
        return `${original}\n(globalThis as any).__gateBloat = ${JSON.stringify(
          parts
        )};\n`;
      },
    },
  },
];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',');

if (has('--list')) {
  for (const g of GATES) {
    console.log(
      `${g.name.padEnd(20)} ${g.mutation ? 'provable' : 'UNPROVEN'}  ${
        g.covers
      }`
    );
  }
  process.exit(0);
}

/**
 * `releaseOnly` gates are skipped by default.
 *
 * Every gate here answers one question: would a USER be hurt if this broke? For
 * most of them the answer is yes — a missing export, a bundle regression, dev
 * code shipping to production, a tarball that will not install.
 *
 * The seven measurement harnesses answer no. They verify that BENCHMARKS RUN —
 * that the arms construct and produce a number. Nobody consuming this library
 * is harmed if `bench-compare.mjs` stops working; the harm is that a published
 * figure becomes unregenerable, which matters at release and not before. They
 * cost 7s of every run to protect against that, so they now run with
 * `--release` and are skipped otherwise.
 *
 * Read the same way if you are tempted to add a gate: a gate that cannot name
 * the user it protects is overhead, and overhead in a checking system is worse
 * than overhead elsewhere, because it dilutes the meaning of a green board.
 */
const selected = GATES.filter(
  (g) =>
    (!only || only.includes(g.name)) &&
    !(has('--fast') && g.slow) &&
    !(!has('--release') && !only && g.releaseOnly)
);

/**
 * Build once, before any gate that reads `dist/`.
 *
 * `needsBuild` was declared on 23 gates and READ BY NOTHING. It looked like
 * machinery and was documentation, so every one of those gates ran against
 * whatever happened to be in `dist/` — and `npm run build` was separately
 * broken (it named a project with no build target and exited 1), so what
 * happened to be there could be many commits old. `npm run gates`, the command
 * that decides whether a release is ready, could pass green on an artifact
 * nobody had rebuilt since before the work it was clearing.
 *
 * The flag now does what its name says. Nx caches, so a fresh tree costs a
 * cache hit; a stale one costs the build, which is the correct price for a
 * verdict about code.
 *
 * A build FAILURE is fatal rather than a skip: gates that read a missing or
 * half-written `dist/` produce noise, and "the build is broken" is the finding,
 * not a footnote to twenty-three other failures.
 */
const BUILD_PROJECTS = 'core,shared,ng-forms,guardrails,events,realtime,schema';

function buildOnceIfNeeded() {
  if (!selected.some((g) => g.needsBuild)) return;
  const names = selected.filter((g) => g.needsBuild).length;
  console.log(`\n· building packages — ${names} gate(s) read dist/`);
  try {
    execFileSync(
      'npx',
      ['nx', 'run-many', '-t', 'build', `--projects=${BUILD_PROJECTS}`],
      { cwd: ROOT, stdio: 'pipe', env: process.env }
    );
  } catch (err) {
    console.error(
      `\n❌ Build failed. ${names} gate(s) read dist/, so running them now ` +
        `would report on stale or missing output.\n\n` +
        String(err.stdout ?? err.message).slice(-2000)
    );
    process.exit(1);
  }
}

buildOnceIfNeeded();

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
  if (!existsSync(path))
    throw new Error(`mutation target missing: ${mutation.file}`);
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
  if (mutated === original)
    throw new Error(`mutation was a no-op in ${mutation.file}`);

  try {
    writeFileSync(path, mutated);
    return fn();
  } finally {
    writeFileSync(path, original);
    if (hash(readFileSync(path, 'utf8')) !== before) {
      console.error(
        `\n  FATAL: could not restore ${mutation.file}. Tree is dirty.`
      );
      process.exit(2);
    }
    // Restoring the SOURCE is not enough when the gate rebuilt from it.
    //
    // `check-bundle-budget.mjs` builds before it measures, so mutating a source
    // file makes it write the mutation INTO `dist/` — and the hash check above
    // only ever looked at the file it wrote. dist stayed poisoned: after one
    // self-test run, `size-report.mjs` measured the bare tree at 13.69KB
    // against a true 5.79KB, because 8KB of mutation payload was still sitting
    // in the built artifact.
    //
    // That is the ORIGINAL stale-dist bug wearing new clothes — dist no longer
    // matching source, with nothing noticing — reintroduced by the fix for it.
    // A mutation harness has to restore DERIVED artifacts too, not just the
    // files it edited.
    if (mutation.file.startsWith('packages/')) {
      try {
        execFileSync(
          'npx',
          ['nx', 'run-many', '-t', 'build', `--projects=${BUILD_PROJECTS}`],
          { cwd: ROOT, stdio: 'pipe', env: process.env }
        );
      } catch {
        console.error(
          `\n  FATAL: restored ${mutation.file} but could not rebuild dist/. ` +
            `Built output still contains the mutation — run \`npm run build\`.`
        );
        process.exit(2);
      }
    }
  }
}

const results = [];

if (has('--self-test')) {
  console.log(
    `\nGate self-test — each gate must FAIL against its own mutation\n`
  );
  for (const gate of selected) {
    if (!gate.mutation) {
      if (gate.provenBy) {
        // Not unproven — proven INDIRECTLY, by a companion gate that mutates the
        // checker itself. Counted as proven so the summary is not pessimistic,
        // and named so the link is visible rather than assumed.
        results.push({ gate, state: 'proven-by' });
        console.log(
          `  · ${gate.name.padEnd(20)} proven via ${gate.provenBy} ✓`
        );
        continue;
      }
      results.push({ gate, state: 'unproven' });
      console.log(`  ~ ${gate.name.padEnd(20)} UNPROVEN — ${gate.unproven}`);
      continue;
    }
    process.stdout.write(
      `  · ${gate.name.padEnd(20)} mutating ${gate.mutation.file} ... `
    );
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
    results.push({
      gate,
      state: ok ? 'pass' : gate.knownFailing ? 'known' : 'fail',
    });
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
  const proven = count('proven') + count('proven-by');
  console.log(
    `${proven}/${selected.length} gates PROVEN able to fail ` +
      `(${count('proven-by')} indirectly, via a companion self-test gate). ` +
      `${count('unproven')} unproven, ${count('blind')} blind, ${count(
        'error'
      )} errored.`
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
    const heldBack = GATES.filter((g) => g.releaseOnly).map((g) => g.name);
    if (!has('--release') && heldBack.length) {
      console.log(
        `  release-only (run with --release): ${heldBack.join(', ')}`
      );
    }
    const skipped = GATES.filter((g) => g.slow).map((g) => g.name);
    console.log(
      `  --fast SKIPPED: ${skipped.join(', ')} — this run did not cover them.`
    );
  }
  process.exit(count('fail') > 0 ? 1 : 0);
}
