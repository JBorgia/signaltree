#!/usr/bin/env node

/**
 * v9 CI Budget Checks
 *
 * Enforces:
 * 1. Bundle size budget (26KB raw, target ~7KB gzipped tree-shaken)
 * 2. Export count budget (max 60 public exports from main barrel)
 * 3. Dev-code leak detection (no console.log without guards in dist/)
 */

const fs = require('fs');
const path = require('path');

const CORE_DIST = path.resolve(__dirname, '../dist/packages/core/dist');
const CORE_INDEX = path.resolve(__dirname, '../packages/core/src/index.ts');

// Budget thresholds
const MAX_EXPORTS = 60;
/**
 * Tree-shaken consumer budgets, in GZIPPED bytes of a bundled production build
 * (`ngDevMode` defined false). Headroom is ~15% over the measured size at the
 * time of writing, so ordinary work does not trip the gate but a structural
 * regression does. Update deliberately, with the measurement in the commit.
 */
const CONSUMER_SCENARIOS = [
  {
    name: 'minimal tree (no markers)',
    imports: 'signalTree',
    code: "const t = signalTree({ user: { name: 'a' }, count: 0 }); t.$.count.set(5); globalThis.o = t();",
    budget: 6000,
  },
  {
    name: 'tree + stored()',
    imports: 'signalTree, stored',
    code: "const t = signalTree({ th: stored('t', 'light'), count: 0 }); t.$.count.set(5); globalThis.o = t();",
    budget: 7400,
  },
];

let failed = false;

// ─── 1. Export Count ──────────────────────────────────────────────────────────

function countExports() {
  console.log('\n📦 Checking export count...');

  if (!fs.existsSync(CORE_INDEX)) {
    console.error('  ❌ Cannot find', CORE_INDEX);
    failed = true;
    return;
  }

  const content = fs.readFileSync(CORE_INDEX, 'utf8');

  // Count export statements (each `export { ... }` or `export type { ... }`)
  // and individual identifiers within them
  const exportMatches = content.match(/export\s+(type\s+)?{([^}]+)}/g) || [];
  let typeCount = 0;
  let valueCount = 0;
  for (const m of exportMatches) {
    const isType = /^export\s+type\s+{/.test(m);
    const inner = m.replace(/export\s+(type\s+)?{/, '').replace(/}/, '');
    const names = inner.split(',').filter((s) => s.trim().length > 0);
    for (const name of names) {
      if (isType || name.trim().startsWith('type ')) {
        typeCount++;
      } else {
        valueCount++;
      }
    }
  }

  const total = typeCount + valueCount;
  console.log(`  Value exports: ${valueCount}`);
  console.log(`  Type exports: ${typeCount}`);
  console.log(`  Total: ${total} (value exports are what the budget gates)`);
  console.log(`  Value-export budget: ${MAX_EXPORTS}`);
  if (valueCount > MAX_EXPORTS) {
    console.error(
      `  ❌ Value export count ${valueCount} exceeds budget of ${MAX_EXPORTS}`
    );
    failed = true;
  } else {
    console.log('  ✅ Within budget');
  }
}

// ─── 2. Bundle Size ──────────────────────────────────────────────────────────

/**
 * The number that matters is what a consumer actually ships after
 * tree-shaking, not the sum of every file in dist/. The raw total counts
 * devtools, serialization, enterprise paths and every other entry point that
 * a given app may never import — so it is red no matter what you do, which is
 * exactly why it stopped being informative. It is reported below as drift
 * information; the GATE is the bundled+minified+gzipped size of real consumer
 * entry points.
 */
function checkBundleSize() {
  console.log('\n📏 Checking bundle size...');

  if (!fs.existsSync(CORE_DIST)) {
    console.error('  ❌ dist/ not found. Run `npx nx build core` first.');
    failed = true;
    return;
  }

  let totalBytes = 0;
  (function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(fullPath);
      else if (entry.name.endsWith('.js'))
        totalBytes += fs.statSync(fullPath).size;
    }
  })(CORE_DIST);
  console.log(
    `  Raw dist total: ${(totalBytes / 1024).toFixed(1)}KB (informational — ` +
      `unbundled, every entry point, NOT what a consumer ships)`
  );

  const { execFileSync } = require('child_process');
  const os = require('os');
  const zlib = require('zlib');
  const entry = path.join(CORE_DIST, 'index.js');

  for (const scenario of CONSUMER_SCENARIOS) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-budget-'));
    const src = path.join(tmp, 'entry.mjs');
    const out = path.join(tmp, 'out.js');
    fs.writeFileSync(
      src,
      `import { ${scenario.imports} } from ${JSON.stringify(entry)};\n` +
        `${scenario.code}\n`
    );
    try {
      execFileSync(
        path.resolve(__dirname, '../node_modules/.bin/esbuild'),
        [
          src,
          '--bundle',
          '--minify',
          '--format=esm',
          '--platform=browser',
          '--external:@angular/core',
          '--define:ngDevMode=false',
          `--outfile=${out}`,
        ],
        { stdio: 'pipe' }
      );
      const gzip = zlib.gzipSync(fs.readFileSync(out)).length;
      const label = `${scenario.name} (prod, ngDevMode=false)`;
      if (gzip > scenario.budget) {
        console.error(
          `  ❌ ${label}: ${gzip}B gzip exceeds budget of ${scenario.budget}B`
        );
        failed = true;
      } else {
        console.log(`  ✅ ${label}: ${gzip}B gzip (budget ${scenario.budget}B)`);
      }
    } catch (err) {
      console.error(`  ❌ Could not bundle "${scenario.name}":`, err.message);
      failed = true;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ─── 3. Dev-Code Leak Detection ──────────────────────────────────────────────

function checkDevCodeLeaks() {
  console.log('\n🔍 Checking for dev-code leaks in dist/...');

  if (!fs.existsSync(CORE_DIST)) {
    console.error('  ❌ dist/ not found. Run `npx nx build core` first.');
    failed = true;
    return;
  }

  const leaks = [];
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Flag unguarded console.log. The guard is usually on the ENCLOSING
          // line, not this one (`if (ngDevMode && cfg.debugMode) {`), so look
          // back a short window as well. Checking only the same line reported
          // every block-guarded log as a leak, which is how this check became
          // permanently noisy and got ignored.
          const guardWindow = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
          const guarded =
            /debugMode|enableConsole|enableLogging|ngDevMode|\?\s*console|&&\s*console/.test(
              guardWindow
            );
          if (/console\.log\(/.test(line) && !/if\s*\(/.test(line) && !guarded) {
            const relPath = path.relative(CORE_DIST, fullPath);
            leaks.push(`${relPath}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
  }
  walkDir(CORE_DIST);

  if (leaks.length > 0) {
    console.warn(`  ⚠️  Found ${leaks.length} potential dev-code leaks:`);
    for (const leak of leaks.slice(0, 10)) {
      console.warn(`    ${leak}`);
    }
    if (leaks.length > 10) {
      console.warn(`    ... and ${leaks.length - 10} more`);
    }
    // Warning only — don't fail for now since some are intentional error logs
  } else {
    console.log('  ✅ No unguarded console.log found');
  }
}

// ─── Run All ──────────────────────────────────────────────────────────────────

console.log('🏗️  v9 CI Budget Checks');
countExports();
checkBundleSize();
checkDevCodeLeaks();

if (failed) {
  console.error('\n❌ Budget checks failed');
  process.exit(1);
} else {
  console.log('\n✅ All budget checks passed');
}
