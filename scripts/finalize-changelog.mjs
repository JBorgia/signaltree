#!/usr/bin/env node
/**
 * finalize-changelog.mjs — stamp the release date onto the top CHANGELOG entry.
 *
 * Rewrites the FIRST `## ` heading when it is an "Unreleased-for-this-version"
 * heading ("## Unreleased (X.Y.Z)") or a bare "## Unreleased" heading into a
 * dated "## X.Y.Z (YYYY-MM-DD)" heading, for the version being released.
 *
 * Why this exists: scripts/release.sh bumps package.json to X.Y.Z, but nothing
 * used to rewrite the "## Unreleased (X.Y.Z)" heading. The release-state gate
 * then only passed pre-bump (against the OLD version); post-bump the shipped
 * version would still say "Unreleased" and main would go red on the next
 * validate. release.sh now bumps → finalizes here → validates, so the
 * release-state gate sees package.json == CHANGELOG == X.Y.Z (RFC 0004
 * v12-audit intake, 2026-07-24).
 *
 * Guarantees:
 *   - Idempotent: if the top heading is already "## X.Y.Z (...)", it is left
 *     untouched (exit 0). Running twice never double-dates.
 *   - Fails loudly (exit 1) if the top heading is neither an Unreleased heading
 *     for this version / bare Unreleased, nor an already-dated heading for this
 *     version — so release.sh can never publish an undocumented version.
 *   - Touches ONLY the first heading line; the rest of the file is byte-stable.
 *
 * Usage:
 *   node scripts/finalize-changelog.mjs <version> [--date YYYY-MM-DD]
 * release.sh passes --date "$(date +%Y-%m-%d)" so the stamped date matches the
 * host's local date (node's default would be UTC).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('❌ finalize-changelog: missing/invalid <version> argument');
  console.error('   Usage: node scripts/finalize-changelog.mjs <version> [--date YYYY-MM-DD]');
  process.exit(2);
}

const dateIdx = process.argv.indexOf('--date');
const today =
  dateIdx !== -1 && process.argv[dateIdx + 1]
    ? process.argv[dateIdx + 1]
    : new Date().toISOString().slice(0, 10);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md');

const text = readFileSync(CHANGELOG, 'utf8');
const lines = text.split('\n');

const headingIdx = lines.findIndex((l) => /^##\s+/.test(l));
if (headingIdx === -1) {
  console.error('❌ finalize-changelog: no "## " heading found in CHANGELOG.md');
  process.exit(1);
}

const heading = lines[headingIdx];
const vEsc = version.replace(/\./g, '\\.');

// Already dated for this exact version → idempotent no-op.
const reAlreadyThis = new RegExp(`^##\\s+v?${vEsc}(\\D|$)`);
if (reAlreadyThis.test(heading)) {
  console.log(
    `✅ finalize-changelog: top heading already "${heading.trim()}" — no change (idempotent)`
  );
  process.exit(0);
}

// "## Unreleased (X.Y.Z)" (this version) or bare "## Unreleased" → stamp date.
const reUnreleasedThis = new RegExp(
  `^##\\s+Unreleased\\s*\\(\\s*${vEsc}\\s*\\)\\s*$`,
  'i'
);
const reUnreleasedBare = new RegExp(`^##\\s+Unreleased\\s*$`, 'i');

if (reUnreleasedThis.test(heading) || reUnreleasedBare.test(heading)) {
  lines[headingIdx] = `## ${version} (${today})`;
  writeFileSync(CHANGELOG, lines.join('\n'));
  console.log(
    `✅ finalize-changelog: "${heading.trim()}" → "## ${version} (${today})"`
  );
  process.exit(0);
}

console.error(
  `❌ finalize-changelog: top CHANGELOG heading is "${heading.trim()}",\n` +
    `   which is neither "## Unreleased (${version})" / "## Unreleased" nor an\n` +
    `   already-dated "## ${version} (...)". Refusing to finalize — document\n` +
    `   ${version} at the top of CHANGELOG.md before releasing.`
);
process.exit(1);
