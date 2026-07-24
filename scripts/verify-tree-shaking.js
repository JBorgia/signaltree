/**
 * Tree-shaking verification test
 *
 * Verifies that optional capability code does NOT leak into bundles that don't
 * opt into it:
 *   1. importing only `signalTree` pulls in no enhancer code;
 *   2. importing `form` WITHOUT `history` pulls in no history engine code
 *      (the injected-feature contract — RFC 0005 §1 / RFC 0007). Note we assert
 *      on ENGINE identifiers, not the `__signalTreeFormHistory` brand string,
 *      which legitimately appears wherever the form() factory guard runs
 *      (exactly like loader()'s `__signalTreeLoader`).
 *
 * Usage: node scripts/verify-tree-shaking.js
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tmpDir = join(root, 'tmp', 'tree-shake-test');
const CORE = join(root, 'dist', 'packages', 'core', 'dist', 'index.js');

// Each case: a minimal entry + identifiers that must be ABSENT from its bundle.
const CASES = [
  {
    name: 'signalTree only — no enhancer code',
    code: `import { signalTree } from '${CORE}';\nglobalThis.__s = typeof signalTree;\n`,
    forbidden: [
      'coalescedUpdates', // batching internals
      'timeTravelManager', // time-travel internals
      'connectDevTools', // devtools internals
      'autoSaveInterval', // persistence internals
    ],
  },
  {
    name: 'form() without history() — no history engine code',
    code: `import { signalTree, form } from '${CORE}';\nconst t = signalTree({ p: form({ initial: { name: '' } }) });\nt.$.p.patch({ name: 'a' });\nglobalThis.__s = t.$.p();\n`,
    // Engine identifiers (undo/redo api property keys + the shared snapshot
    // helper). NOT `__signalTreeFormHistory` — that brand rides with the guard.
    forbidden: ['canRedo', 'canUndo', 'snapshotsEqual'],
  },
];

function bundle(inputPath, outPath) {
  execSync(
    `npx esbuild ${inputPath} --bundle --format=esm --minify --outfile=${outPath} --external:@angular/* --external:zone.js --external:tslib --external:rxjs 2>&1`,
    { cwd: root, stdio: 'pipe' }
  );
}

function main() {
  console.log('🌿 Tree-shaking verification\n');
  mkdirSync(tmpDir, { recursive: true });

  let failed = false;
  for (const [i, c] of CASES.entries()) {
    const input = join(tmpDir, `input-${i}.js`);
    const out = join(tmpDir, `output-${i}.js`);
    writeFileSync(input, c.code);
    try {
      bundle(input, out);
    } catch (e) {
      console.error(`❌ esbuild failed for "${c.name}":`, e.stderr?.toString() || e.message);
      failed = true;
      continue;
    }
    const output = readFileSync(out, 'utf8');
    const sizeKB = (Buffer.byteLength(output) / 1024).toFixed(1);
    const leaked = c.forbidden.filter((m) => output.includes(m));
    if (leaked.length > 0) {
      console.log(`❌ ${c.name} (${sizeKB} KB) — leaked: ${leaked.join(', ')}`);
      failed = true;
    } else {
      console.log(`✅ ${c.name} (${sizeKB} KB)`);
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });

  if (failed) {
    console.log('\n❌ Tree-shaking verification FAILED');
    process.exit(1);
  }
  console.log('\n✅ Tree-shaking verification passed');
}

main();
