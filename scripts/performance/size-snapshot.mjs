#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { ensurePerformanceDirs, sizeLatestPath } from './paths.mjs';

// Build core if dist missing (lightweight check)
try {
  readFileSync('dist/packages/core/fesm2022/signaltree-core.mjs');
} catch {
  console.log('Building core package for size snapshot...');
  execSync('pnpm nx build core --configuration=production', {
    stdio: 'inherit',
  });
}

const filePath = 'dist/packages/core/fesm2022/signaltree-core.mjs';
const code = readFileSync(filePath);
const gzip = zlib.gzipSync(code, { level: 9 });

const out = {
  ts: new Date().toISOString(),
  file: filePath,
  bytes: code.length,
  gzip: gzip.length,
};

ensurePerformanceDirs();
const outPath = sizeLatestPath();
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Size snapshot written:', outPath, out);
