#!/usr/bin/env node
/*
 Small post-build script to set __DEV__ to false in the built FESM artifact.
 This avoids needing to change CI at first and keeps the production build
 DCE-friendly by ensuring the dev-guard expressions are constant false.

 Behavior:
 - Looks for the canonical dist fesm file at dist/packages/core/fesm2022/signaltree-core.mjs
 - Performs safe textual replacements for common dev-guard patterns
 - Writes the file back if changes were made
 - Exits non-zero on error
*/
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const distPath = path.resolve(
  'dist/packages/core/fesm2022/signaltree-core.mjs'
);

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

if (!fs.existsSync(distPath)) {
  fail(`dist file not found: ${distPath} — run the production build first`);
}

let src = fs.readFileSync(distPath, 'utf8');
const beforeLen = src.length;

// Patterns observed in build outputs. Replace defensive ternaries and global checks
// with literal `false` so bundlers/consumers get a deterministic production value.
const patterns = [
  // const __IS_DEV__ = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
  { re: /typeof __DEV__ !== 'undefined' \? __DEV__ : true/g, repl: 'false' },
  // if (typeof globalThis.__DEV__ !== 'undefined') return Boolean(globalThis.__DEV__);
  {
    re: /typeof globalThis.__DEV__ !== 'undefined' \)\s*return Boolean\(globalThis.__DEV__\);/g,
    repl: 'false) return false;',
  },
  // if (typeof __DEV__ !== 'undefined') return Boolean(__DEV__);
  {
    re: /typeof __DEV__ !== 'undefined' \)\s*return Boolean\(__DEV__\);/g,
    repl: 'false) return false;',
  },
];

for (const p of patterns) {
  src = src.replace(p.re, p.repl);
}

const afterLen = src.length;
if (afterLen === beforeLen) {
  console.log(
    'No replacements applied — file appears already production-ready'
  );
} else {
  fs.writeFileSync(distPath, src, 'utf8');
  console.log(`Patched ${distPath}: ${beforeLen} -> ${afterLen} bytes`);
}

// report gzipped size
try {
  const gz = zlib.gzipSync(Buffer.from(src, 'utf8'));
  console.log('gzipped length:', gz.length);
} catch {
  // ignore
}

console.log('done');
