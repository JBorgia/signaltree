#!/usr/bin/env node
/**
 * The entry-point inventory, stated ONCE and generated into every surface.
 *
 * ## The defect class this closes
 *
 * Five hand-written surfaces describe this library's API in prose — the root
 * README, `packages/core/README.md`, `llms.txt`, `llms-full.txt` and the agent
 * SKILL — totalling ~43,000 words, with 97 API symbols described independently
 * in three or more of them. Nothing generated any of it.
 *
 * That is measurable: 74 commits over twelve months fix a doc that had gone
 * stale or was never true, and the same files recur — `packages/core/README.md`
 * eight times, `llms-full.txt` seven, `llms.txt` four, the SKILL four. The rate
 * spikes with major versions, because every API change creates three to five
 * manual edit obligations and none of them is enforced.
 *
 * Existing gates check properties that are mechanically decidable — a symbol
 * exists (`readme-apis`), no removed API is taught (`taught-symbols`), a figure
 * names its generator (`check-numeric-claims`), a path resolves
 * (`check-doc-links`). None can check whether a sentence is still TRUE, so each
 * new gate converts another decidable slice of the class and the obligation
 * count never drops.
 *
 * ## Why this is not a sixth copy
 *
 * The obvious move — a hand-maintained `api-registry.json` — would make it
 * worse: one more file to forget. The source of truth here is **the built
 * barrels themselves**. This tool imports `dist/packages/core/dist/index.js`
 * and `authoring.js`, so the inventory cannot disagree with what ships. If a
 * symbol moves between entry points, every surface changes on the next run.
 *
 * ## What it does and does NOT own
 *
 * It owns the FACTS: which entry points exist, how many symbols each has, which
 * symbols are on `/authoring` and how they group.
 *
 * It does not own the PROSE. The framing, the warnings, the "emitting any of
 * these from `@signaltree/core` is a compile error", the rationale — all of that
 * stays hand-written OUTSIDE the managed region, because it is the part with
 * actual value and it is not derivable from a barrel. Generating it would have
 * destroyed the thing worth keeping.
 *
 *   node tools/gen-api-surface.mjs           # write the regions
 *   node tools/gen-api-surface.mjs --check   # fail if any region is stale
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const BEGIN = (id) =>
  `<!-- BEGIN GENERATED: ${id} — do not edit by hand; run \`node tools/gen-api-surface.mjs\` -->`;
const END = (id) => `<!-- END GENERATED: ${id} -->`;

// ── read the truth ──────────────────────────────────────────────────────────
const distRoot = join(ROOT, 'dist/packages/core/dist/index.js');
const distAuth = join(ROOT, 'dist/packages/core/dist/authoring.js');
for (const p of [distRoot, distAuth]) {
  if (!existsSync(p)) {
    console.error(
      `❌ ${p.slice(ROOT.length + 1)} is missing — build first ` +
        `(\`npx nx run-many -t build --projects=core\`). This tool reads the ` +
        `BUILT barrels on purpose: a source-level guess is how the surfaces ` +
        `drifted in the first place.`
    );
    process.exit(1);
  }
}
const rootMod = await import(distRoot);
const authMod = await import(distAuth);
const names = (m) =>
  Object.keys(m)
    .filter((k) => k !== 'default')
    .sort();
const rootNames = names(rootMod);
const authNames = names(authMod);

/**
 * Declared subpaths, from the SOURCE manifest — that is the file npm reads.
 * v9.0.0 moved four features behind subpaths, and a subpath list is exactly the
 * kind of short, rarely-touched fact that goes stale precisely because it is
 * short and rarely touched.
 */
const subpaths = Object.keys(
  JSON.parse(readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8'))
    .exports ?? {}
)
  .filter((k) => k !== './package.json')
  .sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b)));

/**
 * The companion packages that are actually PUBLISHABLE.
 *
 * `@signaltree/shared` is `private: true` and has never been on the registry
 * (404), so it is not a companion anyone can install — release.sh publishes six
 * packages, not seven. And `@signaltree/enterprise` was removed in 14.0.0 while
 * `packages/core/README.md` — the npm front page — still carried a table row for
 * it and two `npm install` lines naming it. Anyone following those got a resolve
 * failure. `readme-apis` cannot catch that: a package name is not a symbol.
 *
 * Purpose text is NOT generated. "When to add" is editorial judgement that no
 * manifest knows; only the SET of installable packages is owned here.
 */
const PURPOSE = {
  'ng-forms': 'Angular Reactive Forms integration',
  guardrails: 'Development performance monitoring (dev-only)',
  events: 'Typed event/command bus over the tree',
  realtime: 'Keep entity maps in sync with WebSocket / SSE',
  schema: 'Standard Schema validation (Zod, Valibot, ArkType)',
};
const companions = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  // Directories only, and only those that actually carry a manifest — a stray
  // `.DS_Store` crashed the first version of this.
  .filter((e) => e.isDirectory() && e.name !== 'core')
  .map((e) => e.name)
  .filter((d) => existsSync(join(ROOT, 'packages', d, 'package.json')))
  .map((d) => ({
    dir: d,
    manifest: JSON.parse(
      readFileSync(join(ROOT, 'packages', d, 'package.json'), 'utf8')
    ),
  }))
  .filter((p) => !p.manifest.private)
  .sort((a, b) => a.dir.localeCompare(b.dir));

/**
 * Group `/authoring` by pattern, not by a hand-written list — a new symbol
 * lands in the right bucket without anyone remembering to file it.
 */
const GROUPS = [
  ['reader allowlists', (n) => /_READERS$/.test(n)],
  ['marker brands', (n) => /_MARKER$/.test(n)],
  ['marker type guards', (n) => /^is.*Marker$/.test(n)],
  ['other type guards', (n) => /^is[A-Z]/.test(n)],
  [
    'marker authoring',
    (n) => /^create.*Signal$/.test(n) || n === 'registerMarkerProcessor',
  ],
  [
    'enhancer authoring',
    (n) =>
      /^(createEnhancer|composeEnhancers|resolveEnhancerOrder)$/.test(n) ||
      n === 'ENHANCER_META',
  ],
  [
    'write-path plumbing',
    (n) =>
      /^(withWriteContext|getActiveWriteContext|getPathNotifier|interceptLeafSignals)$/.test(
        n
      ),
  ],
  ['observation hooks', (n) => /^on[A-Z]/.test(n)],
  ['constants', (n) => /^SIGNAL_TREE_/.test(n)],
];

function grouped(list) {
  const out = [];
  const seen = new Set();
  for (const [label, test] of GROUPS) {
    const hit = list.filter((n) => !seen.has(n) && test(n));
    hit.forEach((n) => seen.add(n));
    if (hit.length) out.push([label, hit]);
  }
  const rest = list.filter((n) => !seen.has(n));
  if (rest.length) out.push(['other', rest]);
  return out;
}

const authGroups = grouped(authNames);

// ── render, per surface style ───────────────────────────────────────────────
const renderers = {
  /** Dense single paragraph — llms.txt is read whole by an agent. */
  dense() {
    const parts = authGroups.map(
      ([label, ns]) =>
        `${ns.length} ${label} (${ns.map((n) => `\`${n}\``).join(', ')})`
    );
    return (
      `\`@signaltree/core\` exports **${rootNames.length} symbols**; ` +
      `\`@signaltree/core/authoring\` exports **${authNames.length}**: ` +
      parts.join('; ') +
      '.'
    );
  },
  /** Bulleted, for a longer reference document. */
  list() {
    const lines = [
      `- \`@signaltree/core\` — **${rootNames.length} symbols** (the app surface)`,
      `- \`@signaltree/core/authoring\` — **${authNames.length} symbols**:`,
      ...authGroups.map(
        ([label, ns]) =>
          `  - ${label} (${ns.length}): ${ns.map((n) => `\`${n}\``).join(', ')}`
      ),
    ];
    return lines.join('\n');
  },
  /** The published entry points, as declared in package.json `exports`. */
  subpaths() {
    const named = subpaths.filter((p) => p !== '.');
    return (
      `Published entry points (from \`package.json\` \`exports\`): ` +
      `\`@signaltree/core\` plus ` +
      named.map((p) => `\`@signaltree/core${p.slice(1)}\``).join(', ') +
      `. Enhancers are NOT a subpath — they live in the main barrel and are ` +
      `tree-shaken from there.`
    );
  },

  /** The installable companion packages, from their manifests. */
  companions() {
    const rows = companions.map((c) => {
      const why = PURPOSE[c.dir] ?? '—';
      return `| \`${c.manifest.name}\` | ${why} |`;
    });
    return [
      '| Package | When to add |',
      '| ------- | ----------- |',
      ...rows,
    ].join('\n');
  },

  /** Terse — the SKILL is a short instruction file. */
  terse() {
    return (
      `\`@signaltree/core\` has **${rootNames.length} symbols**. ` +
      `\`@signaltree/core/authoring\` has **${authNames.length}**, grouped as: ` +
      authGroups.map(([label, ns]) => `${label} (${ns.length})`).join(', ') +
      '.'
    );
  },
};

const SURFACES = [
  { file: 'apps/demo/public/llms.txt', id: 'api-entry-points', style: 'dense' },
  {
    file: 'apps/demo/public/llms-full.txt',
    id: 'api-entry-points',
    style: 'list',
  },
  {
    file: 'docs/skills/using-signaltree/SKILL.md',
    id: 'api-entry-points',
    style: 'terse',
  },
  {
    file: 'packages/core/README.md',
    id: 'api-entry-points',
    style: 'list',
  },
  {
    file: 'packages/core/README.md',
    id: 'api-subpaths',
    style: 'subpaths',
  },
  {
    file: 'packages/core/README.md',
    id: 'companion-packages',
    style: 'companions',
  },
];

let stale = 0;
let written = 0;
let missing = 0;

for (const s of SURFACES) {
  const abs = join(ROOT, s.file);
  if (!existsSync(abs)) {
    console.error(`❌ ${s.file} does not exist`);
    process.exit(1);
  }
  const text = readFileSync(abs, 'utf8');
  const b = BEGIN(s.id);
  const e = END(s.id);
  const bi = text.indexOf(b);
  const ei = text.indexOf(e);

  if (bi === -1 || ei === -1) {
    missing++;
    console.error(
      `❌ ${s.file} has no \`${s.id}\` managed region.\n` +
        `   Add these two markers around the entry-point inventory:\n` +
        `     ${b}\n     ${e}`
    );
    continue;
  }

  const body = `\n${renderers[s.style]()}\n`;
  const next = text.slice(0, bi + b.length) + body + text.slice(ei);

  // Compare on CONTENT, not bytes.
  //
  // The first version compared byte-for-byte and formatted the whole file to
  // make that fair. Both were wrong. `nx format:write` indents a region nested
  // in a list and adds blank lines around sub-lists, so byte comparison went red
  // on an untouched repo — and formatting the whole file to compensate also
  // reflowed every embedded TypeScript block in the README, which this tool has
  // no business touching.
  //
  // What the gate actually claims is that the INVENTORY matches the barrels. So
  // it compares with whitespace collapsed: prettier may re-indent and re-wrap
  // freely, and a changed symbol, count or grouping still fails.
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  const current = norm(text.slice(bi + b.length, ei));
  const expected = norm(body);

  if (current === expected) {
    console.log(`  ok       ${s.file}`);
    continue;
  }
  if (CHECK) {
    stale++;
    console.error(`  STALE    ${s.file}`);
    continue;
  }
  writeFileSync(abs, next);
  written++;
  console.log(`  written  ${s.file}`);
}

if (missing > 0) process.exit(1);

if (CHECK) {
  if (stale > 0) {
    console.error(
      `\n❌ ${stale} surface(s) disagree with the built barrels.\n` +
        `   Run \`node tools/gen-api-surface.mjs\` and commit the result.\n` +
        `   These regions are generated so the inventory is stated ONCE; a\n` +
        `   hand-edit here is the drift this tool exists to remove.\n`
    );
    process.exit(1);
  }
  console.log(
    `\n✅ all ${SURFACES.length} surfaces match the built barrels ` +
      `(${rootNames.length} root, ${authNames.length} authoring).`
  );
  process.exit(0);
}

console.log(
  `\n✅ ${written} written, ${SURFACES.length - written} already current ` +
    `(${rootNames.length} root, ${authNames.length} authoring).`
);
