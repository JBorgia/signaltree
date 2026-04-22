#!/usr/bin/env node
/**
 * Validate ```typescript code blocks marked with `// @check` from
 * markdown files. Extracts each marked block to `tmp/doc-snippets/` and
 * runs the TypeScript compiler against it using `tsconfig.docs.json`,
 * which maps `@signaltree/*` to the workspace source.
 *
 * Why opt-in?
 *   Compiling every snippet would force every fragment to be a complete
 *   program. Marking with `// @check` keeps maintenance cheap and lets
 *   authors flag the snippets that should stay correct over time
 *   (entry-point READMEs, the architecture guide, etc.).
 *
 * Usage:
 *   node scripts/validate-doc-snippets.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'doc-snippets');
const TSCONFIG = path.join(ROOT, 'tsconfig.docs.json');

const MARKDOWN_GLOBS = [
  'README.md',
  'docs/**/*.md',
  'packages/*/README.md',
];

const SNIPPET_RE = /```typescript\s*\n([\s\S]*?)```/g;
const CHECK_MARKER = /^\s*\/\/\s*@check\b/m;

function listMarkdown() {
  // Lightweight glob (no extra deps). Enumerate by walking specific roots.
  const files = new Set();
  walk(ROOT, files, /(^|\/)README\.md$/);
  walk(path.join(ROOT, 'docs'), files, /\.md$/);
  return [...files].filter(p => !p.includes(`${path.sep}node_modules${path.sep}`));
}

function walk(dir, sink, match) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, sink, match);
    else if (match.test(full)) sink.add(full);
  }
}

function extractMarkedSnippets(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  let m;
  let i = 0;
  while ((m = SNIPPET_RE.exec(src)) !== null) {
    const body = m[1];
    if (!CHECK_MARKER.test(body)) continue;
    out.push({ index: i++, body });
  }
  return out;
}

function ensureDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function emitSnippets(files) {
  ensureDir(OUT_DIR);
  let total = 0;
  for (const file of files) {
    const snippets = extractMarkedSnippets(file);
    if (!snippets.length) continue;
    const rel = path.relative(ROOT, file).replace(/[\\/]/g, '__');
    for (const { index, body } of snippets) {
      const target = path.join(OUT_DIR, `${rel}.snippet${index}.ts`);
      fs.writeFileSync(target, body);
      total++;
    }
  }
  return total;
}

function runTsc() {
  const tscBin = path.join(ROOT, 'node_modules', '.bin', 'tsc');
  const result = spawnSync(tscBin, ['--noEmit', '-p', TSCONFIG], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function main() {
  if (!fs.existsSync(TSCONFIG)) {
    console.error(`Missing ${path.relative(ROOT, TSCONFIG)}.`);
    console.error('Create it with paths mapping @signaltree/* -> packages/*/src.');
    process.exit(2);
  }
  const files = listMarkdown();
  const count = emitSnippets(files);
  if (count === 0) {
    console.log('No snippets marked with `// @check` found. Nothing to validate.');
    return;
  }
  console.log(`Validating ${count} doc snippet(s)...`);
  const status = runTsc();
  if (status !== 0) {
    console.error('Doc snippet validation FAILED.');
    process.exit(status);
  }
  console.log('Doc snippet validation passed.');
}

main();
