#!/usr/bin/env node
/**
 * Release-state semantic gate.
 *
 * Catches two classes the other gates missed:
 *   1. STALE "(unreleased)" — the CHANGELOG top heading is still labeled
 *      "(unreleased)" for a version whose git tag `v<version>` already exists
 *      (the exact 11.6.0 post-release finding: shipped, but the changelog and
 *      llms tables still said "unreleased").
 *   2. VERSION DRIFT — the CHANGELOG top version heading does not match the
 *      root package.json version.
 *
 * Deliberately does NOT fail an "(unreleased)" heading with no tag yet — that
 * is the normal pre-release state (where 12.0.0 sits right now).
 *
 * Usage:
 *   node scripts/verify-release-state.js              # run the gate
 *   node scripts/verify-release-state.js --self-test  # prove the gate fires
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/** Parse the first `## X.Y.Z (label)` heading. */
function topChangelog(text) {
  const m = text.match(/^##\s+(\d+\.\d+\.\d+)\s*(?:\(([^)]*)\))?/m);
  return m ? { version: m[1], label: (m[2] || '').trim() } : null;
}

function gitTagExists(version) {
  try {
    execSync(`git rev-parse -q --verify "refs/tags/v${version}"`, {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Pure core so the self-test can drive it without git/fs. */
function check(changelogText, pkgVersion, tagExistsFn) {
  const errors = [];
  const top = topChangelog(changelogText);
  if (!top) {
    errors.push('CHANGELOG.md has no top-level "## X.Y.Z" version heading.');
    return errors;
  }
  if (top.version !== pkgVersion) {
    errors.push(
      `CHANGELOG top heading is ${top.version} but package.json is ${pkgVersion} — they must match.`
    );
  }
  const isUnreleased = /unreleased/i.test(top.label);
  if (isUnreleased && tagExistsFn(top.version)) {
    errors.push(
      `CHANGELOG ${top.version} is labeled "(${top.label})" but git tag v${top.version} exists — ` +
        `the version shipped; replace "(unreleased)" with the release date.`
    );
  }
  return errors;
}

if (process.argv.includes('--self-test')) {
  const cases = [
    { cl: '## 1.2.3 (unreleased)\n', pkg: '1.2.3', tag: () => true, expectFail: true, name: 'unreleased + tagged → fires' },
    { cl: '## 1.2.3 (2026-01-01)\n', pkg: '1.2.3', tag: () => true, expectFail: false, name: 'dated + tagged → passes' },
    { cl: '## 1.2.3 (unreleased)\n', pkg: '1.2.3', tag: () => false, expectFail: false, name: 'unreleased + untagged → passes (pre-release)' },
    { cl: '## 1.2.4 (unreleased)\n', pkg: '1.2.3', tag: () => false, expectFail: true, name: 'version drift → fires' },
    { cl: 'no heading here\n', pkg: '1.2.3', tag: () => false, expectFail: true, name: 'missing heading → fires' },
  ];
  let ok = true;
  for (const c of cases) {
    const failed = check(c.cl, c.pkg, c.tag).length > 0;
    const pass = failed === c.expectFail;
    if (!pass) ok = false;
    console.log(`${pass ? '✅' : '❌'} self-test: ${c.name}`);
  }
  process.exit(ok ? 0 : 1);
}

const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);
const errors = check(changelog, pkg.version, gitTagExists);
if (errors.length) {
  console.error('❌ Release-state check failed:');
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}
const top = topChangelog(changelog);
console.log(
  `✅ Release-state OK: CHANGELOG top (${top.version}) matches package.json; ` +
    `"${top.label || 'no label'}" is consistent with tag state.`
);
