#!/usr/bin/env node
/**
 * ship-skills.mjs
 *
 * Copies the canonical skill source tree from docs/skills/using-signaltree/
 * into each published package's dist output, so npm consumers of any
 * @signaltree/* package receive the primary skill (mental model) plus the
 * relevant nested sub-skill.
 *
 * Single source of truth: docs/skills/using-signaltree/
 *   - SKILL.md           (primary overview)
 *   - reference/*.md     (deeper reference material)
 *   - <pkg>/SKILL.md     (nested sub-skill per package)
 *
 * Publish layout: each package publishes from dist/packages/<pkg>/, so the
 * skills go to dist/packages/<pkg>/skills/using-signaltree/ (relative to the
 * publish root).
 *
 * This script is intentionally dependency-free — Node built-ins only.
 *
 * Idempotent: reruns wipe and rewrite the destination skills/ directory.
 * Fails loudly if docs/skills/using-signaltree/SKILL.md is missing.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { access, cp, mkdir, readdir, rm, stat } from 'node:fs/promises';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SKILLS_SRC = path.join(REPO_ROOT, 'docs', 'skills', 'using-signaltree');
const DIST_ROOT = path.join(REPO_ROOT, 'dist', 'packages');

// Packages that receive the skill bundle. `nested` is the sub-skill directory
// name under docs/skills/using-signaltree/ (null for `core` — no nested
// sub-skill, core is covered directly by the primary SKILL.md + reference/).
const PACKAGES = [
  { name: 'core', nested: null },
  { name: 'ng-forms', nested: 'ng-forms' },
  { name: 'enterprise', nested: 'enterprise' },
  { name: 'callable-syntax', nested: 'callable-syntax' },
  { name: 'guardrails', nested: 'guardrails' },
  { name: 'events', nested: 'events' },
  { name: 'realtime', nested: 'realtime' },
];

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function logInfo(msg) {
  console.log(`${color.cyan('[ship-skills]')} ${msg}`);
}
function logWarn(msg) {
  console.warn(`${color.yellow('[ship-skills]')} ${msg}`);
}
function logError(msg) {
  console.error(`${color.red('[ship-skills]')} ${msg}`);
}
function logOk(msg) {
  console.log(`${color.green('[ship-skills]')} ${msg}`);
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function assertCanonicalSkillsExist() {
  const primary = path.join(SKILLS_SRC, 'SKILL.md');
  if (!(await pathExists(primary))) {
    logError(
      `Canonical skill source not found: ${path.relative(
        REPO_ROOT,
        primary
      )}`
    );
    logError(
      'Expected docs/skills/using-signaltree/SKILL.md to exist. ' +
        'Authoring lives in a separate workstream — this step must run after the skill content lands.'
    );
    process.exit(1);
  }
  const referenceDir = path.join(SKILLS_SRC, 'reference');
  if (!(await pathExists(referenceDir))) {
    logWarn(
      `reference/ directory not found at ${path.relative(
        REPO_ROOT,
        referenceDir
      )}. Continuing — the primary SKILL.md will still be shipped, but reference material will be missing.`
    );
  }
}

async function copyFile(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
}

async function shipToPackage(pkg) {
  const pkgDistRoot = path.join(DIST_ROOT, pkg.name);

  if (!(await pathExists(pkgDistRoot))) {
    logWarn(
      `${pkg.name}: dist not found at ${path.relative(
        REPO_ROOT,
        pkgDistRoot
      )} — run the package build first. Skipping.`
    );
    return { pkg: pkg.name, status: 'skipped' };
  }

  const pkgSkillsRoot = path.join(
    pkgDistRoot,
    'skills',
    'using-signaltree'
  );

  // Idempotent: wipe and rewrite.
  await rm(pkgSkillsRoot, { recursive: true, force: true });
  await mkdir(pkgSkillsRoot, { recursive: true });

  // 1. Primary SKILL.md — every package gets this.
  const primarySrc = path.join(SKILLS_SRC, 'SKILL.md');
  const primaryDest = path.join(pkgSkillsRoot, 'SKILL.md');
  await copyFile(primarySrc, primaryDest);

  // 2. reference/*.md — every package gets this (if it exists).
  const referenceSrc = path.join(SKILLS_SRC, 'reference');
  if (await pathExists(referenceSrc)) {
    const referenceDest = path.join(pkgSkillsRoot, 'reference');
    await copyDir(referenceSrc, referenceDest);
  }

  // 3. Nested sub-skill (if the package has one).
  if (pkg.nested) {
    const nestedSrc = path.join(SKILLS_SRC, pkg.nested);
    if (!(await pathExists(nestedSrc))) {
      logWarn(
        `${pkg.name}: expected nested sub-skill at ${path.relative(
          REPO_ROOT,
          nestedSrc
        )} but it is missing. Shipping primary + reference only.`
      );
    } else {
      const nestedDest = path.join(pkgSkillsRoot, pkg.nested);
      await copyDir(nestedSrc, nestedDest);
    }
  }

  const files = await countFiles(pkgSkillsRoot);
  logOk(
    `${pkg.name}: shipped ${files} file(s) to ${path.relative(
      REPO_ROOT,
      pkgSkillsRoot
    )}`
  );
  return { pkg: pkg.name, status: 'ok', files };
}

async function countFiles(dir) {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(full);
    } else {
      count += 1;
    }
  }
  return count;
}

async function main() {
  logInfo(
    `Canonical skills source: ${path.relative(REPO_ROOT, SKILLS_SRC)}`
  );

  if (!(await pathExists(SKILLS_SRC))) {
    logError(
      `Canonical skills directory missing: ${path.relative(
        REPO_ROOT,
        SKILLS_SRC
      )}`
    );
    logError(
      'Create docs/skills/using-signaltree/ with SKILL.md and reference/ before running this step.'
    );
    process.exit(1);
  }

  await assertCanonicalSkillsExist();

  if (!(await pathExists(DIST_ROOT))) {
    logError(
      `dist root missing: ${path.relative(REPO_ROOT, DIST_ROOT)} — build the packages first (e.g. \`npm run build:all\`).`
    );
    process.exit(1);
  }

  const results = [];
  for (const pkg of PACKAGES) {
    results.push(await shipToPackage(pkg));
  }

  const ok = results.filter((r) => r.status === 'ok');
  const skipped = results.filter((r) => r.status === 'skipped');

  console.log('');
  logInfo(
    `Done. ${ok.length} package(s) shipped, ${skipped.length} skipped.`
  );

  if (skipped.length > 0) {
    logWarn(
      `Skipped packages (no dist present): ${skipped
        .map((r) => r.pkg)
        .join(', ')}. Run their build target and rerun ship-skills.`
    );
  }
}

main().catch((err) => {
  logError(`Unexpected failure: ${err?.stack || err}`);
  process.exit(1);
});
