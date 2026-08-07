#!/usr/bin/env node
/**
 * The published Angular range must be one the code can actually honour.
 *
 * ## The claim, and why it needs checking
 *
 * Every package declares `@angular/core: ^20 || ^21 || ^22`. CI builds and tests
 * against ONE of those (whatever is installed — 22 today), so two thirds of the
 * promise is untested. Installing three Angular majors side by side to test it
 * properly is a bigger apparatus than this repo wants, and it is not what
 * actually breaks anyway.
 *
 * What breaks is importing an Angular API that does not exist in the OLDEST
 * supported major. That is checkable statically, and it is checked here.
 *
 * ## The specific hazard: `@angular/forms/signals`
 *
 * Signal Forms shipped in Angular 21 and stabilised in 22. `@signaltree/ng-forms`
 * uses it and still claims `^20`, which is correct ONLY because every import of
 * it is `import type` — a type-only import erases at compile time, so the built
 * package has no runtime reference and an Angular 20 install resolves fine. The
 * README documents the split: Angular 20+ for the classic entry, 22+ for the
 * `/signals` subpath.
 *
 * That is a real and deliberate design, and it is one careless `import {}` away
 * from becoming an install-time failure for every Angular 20 consumer — with
 * nothing to catch it, because the repo's own Angular is 22 and it would build,
 * test and publish green.
 *
 * So: any Angular API newer than the declared floor must appear ONLY in
 * type-only imports, and the built output must not reference it at runtime.
 *
 * Usage: node tools/check-angular-compat.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Angular entry points newer than our floor of 20, and the major they landed in.
 * A package may reference these ONLY through `import type`.
 */
const NEWER_THAN_FLOOR = {
  '@angular/forms/signals': 21,
};

const FLOOR = 20;

/**
 * Entry points that deliberately require MORE than the floor.
 *
 * npm has no per-subpath peerDependencies, so a package with a newer-only
 * subpath can only declare the floor its MAIN entry supports and document the
 * rest. `@signaltree/ng-forms` does exactly that: the classic entry works on
 * Angular 20, and `/signals` needs 22+ for stable Signal Forms. Its README
 * states the split.
 *
 * The check that matters is therefore per ENTRY POINT and TRANSITIVE: whatever
 * an entry point can reach must be within that entry point's floor.
 */
const ENTRY_FLOORS = {
  '@signaltree/ng-forms/signals': 22,
};

/** Every file reachable from a built entry, following relative imports. */
function reachableFrom(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/from '(\.[^']*)'/g)) {
      let target = resolve(dirname(file), m[1]);
      if (!target.endsWith('.js')) target += '.js';
      stack.push(target);
    }
  }
  return seen;
}

const problems = [];
let entriesChecked = 0;
let filesChecked = 0;

for (const pkg of readdirSync(join(ROOT, 'packages'))) {
  const manifestPath = join(ROOT, 'packages', pkg, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = manifest.peerDependencies?.['@angular/core'];
  if (!declared || !declared.includes(`^${FLOOR}.`)) continue;

  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    if (subpath.endsWith('package.json') || subpath.includes('*')) continue;
    const target = typeof value === 'string' ? value : (value.import ?? value.default);
    if (typeof target !== 'string') continue;
    const built = join(ROOT, 'dist/packages', pkg, target.replace(/^\.\//, ''));
    if (!existsSync(built)) continue;

    const spec =
      subpath === '.' ? `@signaltree/${pkg}` : `@signaltree/${pkg}${subpath.slice(1)}`;
    const entryFloor = ENTRY_FLOORS[spec] ?? FLOOR;
    entriesChecked++;

    const files = reachableFrom(built);
    filesChecked += files.size;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const [api, since] of Object.entries(NEWER_THAN_FLOOR)) {
        if (text.includes(api) && since > entryFloor) {
          problems.push({
            spec,
            entryFloor,
            api,
            since,
            file: file.slice(ROOT.length + 1),
            declared,
          });
        }
      }
    }
  }
}

console.log(
  `Angular floor ^${FLOOR}: ${entriesChecked} entry point(s), ` +
    `${filesChecked} reachable file(s), against ` +
    `${Object.keys(NEWER_THAN_FLOOR).length} newer Angular API(s).` +
    (Object.keys(ENTRY_FLOORS).length
      ? `\n  Declared exceptions: ${Object.entries(ENTRY_FLOORS)
          .map(([k, v]) => `${k} needs ^${v}`)
          .join(', ')}`
      : '')
);

if (problems.length) {
  console.error(`\n✗ ${problems.length} compatibility violation(s):\n`);
  for (const p of problems) {
    console.error(
      `    ${p.spec} (floor ^${p.entryFloor}, package declares ${p.declared})\n` +
        `      reaches '${p.api}' — Angular ${p.since}+ — via ${p.file}\n` +
        `      Every Angular ${p.entryFloor} consumer of this entry point fails at import.`
    );
  }
  console.error(
    `\nThe repo's own Angular is newer than the floor, so this would build, test\n` +
      `and publish green while being broken for a third of the declared range.`
  );
  process.exit(1);
}

console.log(`✓ every entry point stays within its declared Angular floor.`);
