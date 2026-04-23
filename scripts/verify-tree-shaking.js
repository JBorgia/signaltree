/**
 * Tree-shaking verification test
 *
 * Verifies that importing only `signalTree` from @signaltree/core
 * does NOT pull in enhancer code in the final bundle.
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

// Enhancer names that should NOT appear if only signalTree is imported
const ENHANCER_MARKERS = [
  'coalescedUpdates',       // batching internals
  'timeTravelManager',      // time-travel internals
  'connectDevTools',        // devtools internals
  'autoSaveInterval',       // persistence internals
];

function main() {
  console.log('🌿 Tree-shaking verification test\n');

  // 1. Create a minimal app that only imports signalTree
  mkdirSync(tmpDir, { recursive: true });

  writeFileSync(
    join(tmpDir, 'input.js'),
    `import { signalTree } from '${join(root, 'dist', 'packages', 'core', 'dist', 'index.js')}';\nconsole.log(typeof signalTree);\n`
  );

  // 2. Bundle with esbuild (tree-shakes by default)
  try {
    execSync(
      `npx esbuild ${join(tmpDir, 'input.js')} --bundle --format=esm --outfile=${join(tmpDir, 'output.js')} --external:@angular/* --external:zone.js --external:tslib 2>&1`,
      { cwd: root, stdio: 'pipe' }
    );
  } catch (e) {
    console.error('❌ esbuild bundle failed:', e.stderr?.toString() || e.message);
    process.exit(1);
  }

  // 3. Read the bundled output
  const output = readFileSync(join(tmpDir, 'output.js'), 'utf8');
  const outputSizeKB = (Buffer.byteLength(output) / 1024).toFixed(1);
  console.log(`   Bundle size: ${outputSizeKB} KB`);

  // 4. Check for enhancer markers
  const found = [];
  for (const marker of ENHANCER_MARKERS) {
    if (output.includes(marker)) {
      found.push(marker);
    }
  }

  // 5. Cleanup
  rmSync(tmpDir, { recursive: true, force: true });

  // 6. Report
  if (found.length > 0) {
    console.log(`\n❌ Tree-shaking FAILED — enhancer code leaked into minimal bundle:`);
    for (const f of found) {
      console.log(`   - ${f}`);
    }
    process.exit(1);
  } else {
    console.log(`   No enhancer code found in minimal bundle`);
    console.log(`\n✅ Tree-shaking verification passed`);
  }
}

main();
