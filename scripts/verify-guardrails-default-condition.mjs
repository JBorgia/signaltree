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
 * temp node_modules and running `require.resolve` in child processes with
 * `--conditions=development`, `--conditions=production`, and no conditions.
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
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(process.argv[3], 'probe.js'));
  process.stdout.write(req.resolve(process.argv[4]));
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

function resolveWith(conditions, specifier) {
  const nodeArgs = conditions.map((c) => `--conditions=${c}`);
  const res = spawnSync(
    process.execPath,
    [...nodeArgs, self, '--print-resolution', tmp, specifier],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(
      `resolution failed for ${specifier} (conditions: ${conditions.join(',') || 'none'}):\n${res.stderr}`
    );
  }
  return res.stdout.trim();
}

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
for (const [conditions, specifier, expectedSuffix, label] of CASES) {
  let resolved;
  try {
    resolved = resolveWith(conditions, specifier);
  } catch (e) {
    failed++;
    console.error(`✗ ${label} — ${String(e.message).split('\n')[0]}`);
    continue;
  }
  const normalized = resolved.split(path.sep).join('/');
  if (normalized.endsWith(expectedSuffix)) {
    console.log(`✓ ${label}`);
  } else {
    failed++;
    console.error(`✗ ${label} — resolved to ${resolved}`);
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
console.log('\nAll guardrails conditional-exports resolutions are correct.');
