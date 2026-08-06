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
    name: 'test:core',
    covers: 'core behaviour, including every spec added for 14.0.0',
    cmd: ['npx', 'nx', 'test', 'core', '--skip-nx-cache'],
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
    name: 'lint:all',
    covers: 'eslint across all 9 published + demo projects',
    cmd: ['npm', 'run', 'lint:all'],
    slow: true,
    mutation: {
      file: 'packages/core/src/lib/utils.ts',
      append: '\nfunction __gateUnused(x: any) { return x; }\n',
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
    name: 'bundle-budget',
    covers: 'built package sizes stay inside their budgets',
    cmd: ['node', 'tools/check-bundle-budget.mjs'],
    needsBuild: true,
    knownFailing:
      'budgets are stale for 14.0.0 by explicit decision — re-tune once the ' +
      'implementation is settled. Reported, never silently skipped.',
    unproven: 'cannot self-test a gate that is already red',
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
  if (mutation.append) {
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
