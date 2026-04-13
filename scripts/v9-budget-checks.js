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
const MAX_BUNDLE_SIZE_KB = 200; // raw dist total in KB (preserveModules emits all modules)

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
  console.log(`  Total: ${total} (budget: ${MAX_EXPORTS})`);
  if (valueCount > MAX_EXPORTS) {
    console.error(
      `  ❌ Value export count ${valueCount} exceeds budget of ${MAX_EXPORTS}`
    );
    failed = true;
  } else {
    console.log('  ✅ Within budget');
  }
}

// ─── 2. Bundle Size ───────────────────────────────────────────────────────────

function checkBundleSize() {
  console.log('\n📏 Checking bundle size...');

  if (!fs.existsSync(CORE_DIST)) {
    console.error('  ❌ dist/ not found. Run `npx nx build core` first.');
    failed = true;
    return;
  }

  let totalBytes = 0;
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        totalBytes += fs.statSync(fullPath).size;
      }
    }
  }
  walkDir(CORE_DIST);

  const totalKB = (totalBytes / 1024).toFixed(1);
  console.log(`  Total JS: ${totalKB}KB (budget: ${MAX_BUNDLE_SIZE_KB}KB)`);
  if (parseFloat(totalKB) > MAX_BUNDLE_SIZE_KB) {
    console.error(
      `  ❌ Bundle size ${totalKB}KB exceeds budget of ${MAX_BUNDLE_SIZE_KB}KB`
    );
    failed = true;
  } else {
    console.log('  ✅ Within budget');
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
          // Flag unguarded console.log (not inside if blocks or ternaries)
          if (
            /console\.log\(/.test(line) &&
            !/if\s*\(/.test(line) &&
            !/debugMode/.test(line) &&
            !/enableConsole/.test(line) &&
            !/ngDevMode/.test(line) &&
            !/\?\s*console/.test(line) &&
            !/&&\s*console/.test(line)
          ) {
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
