#!/usr/bin/env node
/**
 * Guardrails conditional-exports resolution check (RFC 0004 §8 item 4).
 *
 * @signaltree/guardrails ships two builds behind conditional exports:
 *   - dist/index.js          — the real implementation (dev)
 *   - dist/noop.js           — the zero-cost stub (production)
 *
 * The bug this pins: the bare `"default"` condition used to map to noop.js,
 * so any bundler/runtime that sets NEITHER `development` NOR `production`
 * (plain `node`, vitest without conditions, older/plain bundler configs)
 * silently got the no-op — guardrails dead even in dev. The contract is now:
 *
 *   development → real   |   production → noop   |   default → REAL
 *
 * (Missing-condition consumers must err toward the functional build; only an
 * explicit `production` condition may select the noop.)
 *
 * This script exercises Node's actual resolver — no hand-rolled exports
 * parsing — by symlinking the BUILT package (dist/packages/guardrails) into a
 * temp node_modules and resolving in child processes with
 * `--conditions=development`, `--conditions=production`, and no conditions.
 *
 * ## Both resolution modes, because one of them was covering nothing
 *
 * This used `require.resolve` alone, and `tools/verify-gates.mjs --self-test`
 * caught what that misses: pointing the root `production.import` at the FULL
 * build instead of the noop left the gate reporting `production → noop ✓`. CJS
 * resolution never reads the `import` condition — it reads `require`, and
 * failing that `default` — so every `import` key in the exports map was
 * unverified. That is the key an Angular consumer actually resolves through,
 * since the package ships ESM and is pulled in by a bundler.
 *
 * So each case now runs TWICE, once per mode:
 *   - `import`  — `import.meta.resolve` from an ESM probe. What a bundler does.
 *   - `require` — `require.resolve` from a CJS probe. What SSR and CJS Jest do.
 *
 * Both must land on the same file: a package whose `import` and `require` keys
 * disagree about dev-vs-noop would give one consumer live guardrails and another
 * a silent stub, which is worse than either being wrong consistently.
 *
 * Requires a prior `nx build guardrails`. Exit non-zero on any mismatch.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtPkg = path.join(repoRoot, 'dist', 'packages', 'guardrails');

// ---------------------------------------------------------------------------
// Child mode: resolve the requested subpath under the current conditions.
// ---------------------------------------------------------------------------
if (process.argv[2] === '--print-resolution') {
  const [, , , mode, dir, specifier] = process.argv;
  if (mode === 'require') {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(dir, 'probe.js'));
    process.stdout.write(req.resolve(specifier));
  } else {
    // Resolve as an ESM parent inside the fixture, so the `import` condition
    // applies. A probe module is needed because import.meta.resolve is relative
    // to the CALLING module, and this file lives in the repo, not the fixture.
    const probe = path.join(dir, 'probe.mjs');
    fs.writeFileSync(
      probe,
      'process.stdout.write(import.meta.resolve(process.argv[2]));\n'
    );
    // process.execArgv MUST be propagated: the --conditions flags live there,
    // and a probe spawned without them resolves under the default condition set.
    // Omitting it made this check report `production -> index.js` for a package
    // whose map is correct — a false RED, the same class of defect as the false
    // GREEN that prompted adding the import mode in the first place.
    const res = spawnSync(process.execPath, [...process.execArgv, probe, specifier], {
      encoding: 'utf8',
      env: process.env,
    });
    if (res.status !== 0) {
      process.stderr.write(res.stderr);
      process.exit(1);
    }
    process.stdout.write(fileURLToPath(res.stdout.trim()));
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Parent mode: set up the fixture and assert.
// ---------------------------------------------------------------------------
for (const f of ['package.json', 'dist/index.js', 'dist/noop.js', 'dist/factories/index.js']) {
  if (!fs.existsSync(path.join(builtPkg, f))) {
    console.error(
      `✗ missing ${path.join('dist/packages/guardrails', f)} — run \`nx build guardrails\` first.`
    );
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-guardrails-exports-'));
const linkDir = path.join(tmp, 'node_modules', '@signaltree');
fs.mkdirSync(linkDir, { recursive: true });
fs.symlinkSync(builtPkg, path.join(linkDir, 'guardrails'), 'dir');

const self = fileURLToPath(import.meta.url);

function resolveWith(conditions, specifier, mode) {
  const nodeArgs = conditions.map((c) => `--conditions=${c}`);
  const res = spawnSync(
    process.execPath,
    [...nodeArgs, self, '--print-resolution', mode, tmp, specifier],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(
      `resolution failed for ${specifier} via ${mode} (conditions: ${conditions.join(',') || 'none'}):\n${res.stderr}`
    );
  }
  return res.stdout.trim();
}

/** Both modes must agree, and both must match the expectation. */
const MODES = ['import', 'require'];

const CASES = [
  // [conditions, specifier, expected basename-suffix, label]
  [[], '@signaltree/guardrails', 'dist/index.js', 'default (no dev/prod condition) → REAL'],
  [['development'], '@signaltree/guardrails', 'dist/index.js', 'development → real'],
  [['production'], '@signaltree/guardrails', 'dist/noop.js', 'production → noop'],
  [[], '@signaltree/guardrails/factories', 'dist/factories/index.js', 'factories default → REAL factories'],
  [['development'], '@signaltree/guardrails/factories', 'dist/factories/index.js', 'factories development → real factories'],
  [['production'], '@signaltree/guardrails/factories', 'dist/factories/index.js', 'factories production → real artifact (its internal guardrails are ngDevMode-gated to noop)'],
];

let failed = 0;
let checked = 0;
for (const [conditions, specifier, expectedSuffix, label] of CASES) {
  for (const mode of MODES) {
    checked++;
    let resolved;
    try {
      resolved = resolveWith(conditions, specifier, mode);
    } catch (e) {
      failed++;
      console.error(`✗ [${mode}] ${label} — ${String(e.message).split('\n')[0]}`);
      continue;
    }
    const normalized = resolved.split(path.sep).join('/');
    if (normalized.endsWith(expectedSuffix)) {
      console.log(`✓ [${mode.padEnd(7)}] ${label}`);
    } else {
      failed++;
      console.error(`✗ [${mode.padEnd(7)}] ${label} — resolved to ${resolved}`);
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(
    `\n${failed} exports-condition check(s) failed. If "default" resolves to noop.js, ` +
      `guardrails is silently dead for every consumer that sets neither the ` +
      `development nor the production condition.`
  );
  process.exit(1);
}
console.log(
  `\nAll ${checked} guardrails conditional-exports resolutions are correct ` +
    `(${CASES.length} cases x ${MODES.join(' + ')}).`
);
