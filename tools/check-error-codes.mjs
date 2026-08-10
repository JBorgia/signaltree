#!/usr/bin/env node
/**
 * Every diagnostic code the library can emit must appear in the catalogue, and
 * the catalogue must invent none.
 *
 * ## Why
 *
 * `docs/errors/README.md` is a hand-written mirror of the codes embedded in
 * `SIGNAL_TREE_MESSAGES` and the marker warnings. It has been corrected six
 * times — fourth on the list of files this repo keeps fixing for staleness — and
 * when this gate was written it was short by two: **ST1031** (invalid security
 * config) and **ST1032** (lazy not injected) could both be emitted at runtime
 * and were documented nowhere. A user hitting either had no page to land on.
 *
 * The earlier sweep missed them because it only looked at the ST2xxx series and
 * counted rather than compared: the catalogue listed 27 ST2xxx codes and source
 * had 27, so it read as clean. Counting a proxy instead of comparing the sets is
 * the recurring shape of every defect in this repo's history.
 *
 * ## What it does NOT do
 *
 * It does not generate the catalogue. Each row carries a hand-written
 * cause-and-fix that is more useful than the terse runtime string, and that
 * prose is the reason the page exists. Only the SET of codes is enforced —
 * bidirectionally, because a documented code that no longer exists is as wrong
 * as an emitted code nobody documented.
 *
 *   node tools/check-error-codes.mjs
 *   node tools/check-error-codes.mjs --self-test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE = 'docs/errors/README.md';
const CODE = /\bST[12]\d{3}\b/g;

function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|dist/.test(e.name)) continue;
      sources(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const emitted = new Set();
for (const pkg of readdirSync(join(ROOT, 'packages'))) {
  const src = join(ROOT, 'packages', pkg, 'src');
  try {
    if (!statSync(src).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const f of sources(src)) {
    for (const m of readFileSync(f, 'utf8').matchAll(CODE)) emitted.add(m[0]);
  }
}

const documented = new Set(
  (readFileSync(join(ROOT, CATALOGUE), 'utf8').match(CODE) ?? []).map(String)
);

const undocumented = [...emitted].filter((c) => !documented.has(c)).sort();
const phantom = [...documented].filter((c) => !emitted.has(c)).sort();

if (process.argv.includes('--self-test')) {
  // The check must fail when a code is emitted and undocumented. Simulate by
  // asserting against a catalogue with one code removed.
  const probe = new Set(documented);
  const victim = [...emitted].sort()[0];
  probe.delete(victim);
  const caught = [...emitted].some((c) => !probe.has(c));
  if (!caught) {
    console.error('❌ self-test: removing a documented code was NOT detected.');
    process.exit(1);
  }
  if (undocumented.length || phantom.length) {
    console.error(
      '⚠ self-test: mutation detected, but the catalogue is already out of ' +
        'sync, so a green run proves nothing.'
    );
    process.exit(1);
  }
  console.log(
    `\n✅ self-test: a missing code is detected, and the catalogue is in sync ` +
      `without the probe (${emitted.size} codes).`
  );
  process.exit(0);
}

console.log(
  `${emitted.size} diagnostic code(s) emitted by the packages; ` +
    `${documented.size} in ${CATALOGUE}.`
);

if (!undocumented.length && !phantom.length) {
  console.log('✅ every emitted code is documented, and none is invented.');
  process.exit(0);
}
if (undocumented.length) {
  console.error(
    `\n❌ emitted but NOT documented: ${undocumented.join(', ')}\n` +
      `   A user who hits one of these has no page to land on. Add a row to ` +
      `${CATALOGUE}.`
  );
}
if (phantom.length) {
  console.error(
    `\n❌ documented but never emitted: ${phantom.join(', ')}\n` +
      `   Either the code was retired and the row should say so, or the row is ` +
      `fictional.`
  );
}
process.exit(1);
