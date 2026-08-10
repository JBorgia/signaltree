#!/usr/bin/env node
/**
 * Every reference a live doc makes must resolve — paths, and package names in
 * install instructions.
 *
 * ## Why this exists
 *
 * 28 relative links were broken when this was written, 22 of them outside
 * `docs/archive/`. Five sat in files that ship inside the npm tarballs, where a
 * README is immutable for the life of a published version:
 *
 *   - `packages/core/README.md` pointed at `../enterprise/README.md` for the
 *     migration table — the package deleted in the same release.
 *   - `packages/guardrails/README.md` pointed at a `docs/guardrails` directory
 *     that has never existed.
 *   - `packages/schema/README.md` and the schema SKILL both pointed at
 *     `validation-enhancer-plan.md`; the file is `schema-enhancer-plan.md`.
 *   - Two shipped skill files under `reference/` were off by one `../`.
 *
 * And the root README claimed a pointer shim "already exists in this repo" at
 * `.claude/skills/using-signaltree/SKILL.md`. `.claude/` is gitignored, so it
 * never could.
 *
 * None of it was caught by anything. `readme-apis` checks that every
 * `@signaltree` SYMBOL named in a README exists; nothing checked that a PATH
 * named in a doc exists. A link is a claim about the repository, and it is the
 * cheapest kind of claim to verify.
 *
 * ## What counts as live
 *
 * `docs/archive/**` and `CHANGELOG.md` are excluded, for the same reason
 * `check-numeric-claims.mjs` excludes them: they are point-in-time records. A
 * changelog entry that links to `packages/enterprise/README.md` is not wrong,
 * it is describing a release where that package existed. Rewriting history to
 * keep a linter quiet destroys the thing history is for.
 *
 * Anchors (`#section`) are stripped, not verified — checking heading slugs
 * across four markdown renderers is a different problem with a worse
 * false-positive rate. External URLs are not fetched: this gate must not depend
 * on the network.
 *
 * ## Install instructions
 *
 * A second check, same principle. `packages/core/README.md` — the page npm
 * renders, immutable once published — told readers to run
 * `npm install @signaltree/core @signaltree/enterprise` for a package removed in
 * 14.0.0 and unpublished for 14.x. It survived the removal commit and a manual
 * sweep of the npm-facing surfaces. `readme-apis` cannot catch it, because a
 * package name is not a symbol.
 *
 * So every `@signaltree/*` named in an `npm install` line on a live surface must
 * be a directory under `packages/` whose manifest is not `private`. That rules
 * out both a removed package and `@signaltree/shared`, which is private and has
 * never been on the registry.
 *
 *   node tools/check-doc-links.mjs
 *   node tools/check-doc-links.mjs --list        # every link it can see
 *   node tools/check-doc-links.mjs --self-test   # prove it can fail
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Point-in-time records, and anything not ours. */
const SKIP_DIR =
  /(^|\/)(node_modules|\.git|dist|artifacts|coverage|\.nx)(\/|$)/;
const SKIP_FILE = /(^|\/)(docs\/archive\/|CHANGELOG\.md$)/;

/** A link target we deliberately do not resolve on disk. */
const IGNORE_TARGET = /^(https?:|mailto:|tel:|data:|#|<|\{)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(ROOT, abs);
    if (SKIP_DIR.test('/' + rel + '/')) continue;
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(md|txt)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Publishable `@signaltree/*` names, from the manifests npm reads. */
function publishable() {
  const out = new Set();
  for (const e of readdirSync(join(ROOT, 'packages'), {
    withFileTypes: true,
  })) {
    if (!e.isDirectory()) continue;
    const m = join(ROOT, 'packages', e.name, 'package.json');
    if (!existsSync(m)) continue;
    const j = JSON.parse(readFileSync(m, 'utf8'));
    if (!j.private && j.name) out.add(j.name);
  }
  return out;
}

/** `@signaltree/*` names in install instructions that cannot be installed. */
export function scanInstalls() {
  const ok = publishable();
  const bad = [];
  for (const abs of walk(ROOT)) {
    const rel = relative(ROOT, abs);
    if (SKIP_FILE.test(rel)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    // Only inside fenced code — that is where an instruction a reader will COPY
    // lives. Prose that mentions a bad install in order to describe it is not an
    // instruction, and flagging it makes the gate unusable in its own docs: the
    // first version failed on tools/GATES.md, where the enterprise defect is
    // written up as an example.
    let inFence = false;
    lines.forEach((line, i) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (!inFence) return;
      if (!/\b(npm|pnpm|yarn|bun)\s+(install|add)\b/.test(line)) return;
      for (const m of line.matchAll(/@signaltree\/[a-z0-9-]+/g)) {
        if (!ok.has(m[0])) bad.push({ file: rel, line: i + 1, pkg: m[0] });
      }
    });
  }
  return bad;
}

export function scan() {
  const links = [];
  for (const abs of walk(ROOT)) {
    const rel = relative(ROOT, abs);
    if (SKIP_FILE.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\]\(([^)\s]+?)(#[^)]*)?\)/g)) {
        const target = m[1];
        if (IGNORE_TARGET.test(target)) continue;
        // Absolute site paths are a web concern, not a filesystem one.
        if (target.startsWith('/')) continue;
        const resolved = resolve(dirname(abs), decodeURIComponent(target));
        links.push({
          file: rel,
          line: i + 1,
          target,
          ok: existsSync(resolved),
        });
      }
    });
  }
  return links;
}

const argv = process.argv.slice(2);

if (argv.includes('--self-test')) {
  // Break the exact thing the gate claims to watch: add a link to a file that
  // is not there, in a surface the gate reads. A gate that stays green against
  // its own mutation is not a gate.
  const probeFile = join(ROOT, 'docs', '__link_gate_probe__.md');
  writeFileSync(
    probeFile,
    '# probe\n\nSee [nothing](./definitely-not-a-real-file-9f3a.md).\n'
  );
  let caught;
  try {
    caught = scan().some(
      (l) => l.file.includes('__link_gate_probe__') && !l.ok
    );
  } finally {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(probeFile);
  }
  const clean = scan().every((l) => l.ok) && scanInstalls().length === 0;
  if (!caught) {
    console.error('❌ self-test: the gate did NOT flag a broken link.');
    process.exit(1);
  }
  if (!clean) {
    console.error(
      '⚠ self-test: mutation detected, but the repo has pre-existing ' +
        'broken links, so a green run cannot be distinguished from a lucky one.'
    );
    process.exit(1);
  }
  console.log(
    '\n✅ self-test: a link to a missing file is flagged, and the repo is ' +
      'clean without the probe.'
  );
  process.exit(0);
}

const links = scan();
const broken = links.filter((l) => !l.ok);
const badInstalls = scanInstalls();

if (argv.includes('--list')) {
  for (const l of links) {
    console.log(
      `  ${l.ok ? 'ok      ' : 'BROKEN  '}${l.file}:${l.line}  ${l.target}`
    );
  }
  console.log('');
}

const files = new Set(links.map((l) => l.file));
console.log(
  `${links.length} relative link(s) across ${files.size} live surface(s); ` +
    `${links.length - broken.length} resolve.`
);

if (broken.length === 0 && badInstalls.length === 0) {
  console.log(
    '✅ every relative link resolves and every install instruction names a ' +
      'publishable package. (docs/archive/** and CHANGELOG.md are ' +
      'point-in-time and excluded.)'
  );
  process.exit(0);
}

if (badInstalls.length > 0) {
  console.error(
    `\n❌ ${badInstalls.length} install instruction(s) name a package that ` +
      `cannot be installed:\n`
  );
  for (const b of badInstalls)
    console.error(`   ${b.file}:${b.line}  ->  ${b.pkg}`);
  console.error(
    `\n   Either the package was removed (drop the instruction) or it is ` +
      `private and was never published.\n`
  );
}
if (broken.length === 0) process.exit(1);

console.error(`\n❌ ${broken.length} broken link(s):\n`);
const byFile = new Map();
for (const l of broken) {
  if (!byFile.has(l.file)) byFile.set(l.file, []);
  byFile.get(l.file).push(l);
}
for (const [file, ls] of byFile) {
  console.error(`   ${file}`);
  for (const l of ls) console.error(`      :${l.line}  ->  ${l.target}`);
}
console.error(
  `\n   Fix the path, or delete the link. If the target is a file that was\n` +
    `   deliberately removed, say so in prose instead of linking to it —\n` +
    `   docs/architecture/schema-enhancer-plan.md does that for a deleted\n` +
    `   spike artifact.\n`
);
process.exit(1);
