#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const coreDistRoot = path.join(workspaceRoot, 'dist', 'packages', 'core');
const runtimeRoot = path.join(coreDistRoot, 'dist');
const jsExtensions = new Set(['.js', '.mjs', '.cjs']);

const forbiddenMarkers = [
  'recordProductionSubstrateStat',
  'installProductionSubstrateStatsForTesting',
  'clearProductionSubstrateStatsForTesting',
  'resetProductionSubstrateStatsForTesting',
  'slotReads',
  'slotWrites',
  'equalityChecks',
  'revisionIncrements',
  'positionResolutions',
  'publicationDependencyReads',
  'publications',
  'treeVisits',
];

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (jsExtensions.has(path.extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort();
}

if (!fs.existsSync(runtimeRoot)) {
  fail(
    `Missing built core runtime directory at ${path.relative(workspaceRoot, runtimeRoot)}. Build core before running this guard.`
  );
}

const runtimeFiles = walkFiles(runtimeRoot);
if (runtimeFiles.length === 0) {
  fail(
    `No emitted JS artifacts found under ${path.relative(workspaceRoot, runtimeRoot)}.`
  );
}

const violations = [];

for (const filePath of runtimeFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const marker of forbiddenMarkers) {
    if (!source.includes(marker)) {
      continue;
    }

    violations.push({
      filePath: path.relative(workspaceRoot, filePath),
      marker,
    });
  }
}

if (violations.length > 0) {
  console.error('❌ Production core bundle still contains perf instrumentation markers:');
  for (const violation of violations) {
    console.error(`   ${violation.filePath}: ${violation.marker}`);
  }
  process.exit(1);
}

console.log(
  `✅ Verified ${runtimeFiles.length} built core runtime artifacts contain no live perf instrumentation markers.`
);
