/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const roots = ['packages/core/src', 'packages/ng-forms/src'];
const exts = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.d.ts',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name.startsWith('.')
    ) {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function findExistingTarget(baseDir, spec) {
  const absBase = path.resolve(baseDir, spec);
  const candidates = [];

  if (path.extname(absBase)) {
    candidates.push(absBase);
  } else {
    for (const ext of exts) candidates.push(absBase + ext);
    for (const ext of exts) candidates.push(path.join(absBase, 'index' + ext));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  if (fs.existsSync(absBase) && fs.statSync(absBase).isDirectory()) {
    return absBase;
  }

  return null;
}

function listDirCaseInsensitive(parentDir, name) {
  let entries;
  try {
    entries = fs.readdirSync(parentDir);
  } catch {
    return null;
  }
  const lower = name.toLowerCase();
  return entries.find((e) => e.toLowerCase() === lower) ?? null;
}

function checkSpecifier(importerFile, spec) {
  if (!(spec.startsWith('./') || spec.startsWith('../'))) return [];

  const baseDir = path.dirname(importerFile);
  const target = findExistingTarget(baseDir, spec);
  const issues = [];

  if (!target) {
    issues.push({ kind: 'missing', importerFile, spec });
    return issues;
  }

  const segments = spec.split('/').filter(Boolean);
  let curDir = baseDir;

  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      curDir = path.resolve(curDir, seg);
      continue;
    }

    const onDisk = listDirCaseInsensitive(curDir, seg);
    if (!onDisk) break;

    if (onDisk !== seg) {
      issues.push({
        kind: 'case',
        importerFile,
        spec,
        segment: seg,
        actual: onDisk,
        at: curDir,
      });
    }

    const next = path.join(curDir, onDisk);
    if (fs.existsSync(next) && fs.statSync(next).isDirectory()) {
      curDir = next;
    }
  }

  return issues;
}

function extractSpecifiers(code) {
  const specs = [];
  const re1 =
    /(?:import|export)\s+(?:type\s+)?[^;]*?from\s*['"]([^'"]+)['"]/g;
  const re2 = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const re3 = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;
  while ((match = re1.exec(code))) specs.push(match[1]);
  while ((match = re2.exec(code))) specs.push(match[1]);
  while ((match = re3.exec(code))) specs.push(match[1]);
  return specs;
}

const issues = [];
for (const root of roots) {
  for (const file of walk(path.resolve(root))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const spec of extractSpecifiers(code)) {
      issues.push(...checkSpecifier(file, spec));
    }
  }
}

const missing = issues.filter((x) => x.kind === 'missing');
const casing = issues.filter((x) => x.kind === 'case');

console.log(`Scanned roots: ${roots.join(', ')}`);
console.log(`Missing: ${missing.length}`);
console.log(`Case mismatches: ${casing.length}`);

if (missing.length) {
  console.log('\nMissing relative imports:');
  for (const m of missing.slice(0, 120)) {
    console.log(`- ${path.relative(process.cwd(), m.importerFile)} -> ${m.spec}`);
  }
  if (missing.length > 120) console.log(`... and ${missing.length - 120} more`);
}

if (casing.length) {
  console.log('\nCase mismatches:');
  for (const c of casing.slice(0, 200)) {
    console.log(
      `- ${path.relative(process.cwd(), c.importerFile)} -> ${c.spec} (segment '${c.segment}' should be '${c.actual}')`
    );
  }
  if (casing.length > 200) console.log(`... and ${casing.length - 200} more`);
}

process.exit(missing.length || casing.length ? 1 : 0);
