#!/usr/bin/env node

/**
 * Size Claim Verification
 * ========================
 *
 * Prevents the "barrel file measurement" mistake by:
 * 1. Measuring FULL package contents (all .js files)
 * 2. Comparing against claimed sizes in consolidated-bundle-analysis.js
 * 3. Failing CI if claims are off by >5%
 *
 * Run this in CI to catch size claim drift.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Import package configs from consolidated-bundle-analysis.js
const scriptPath = path.join(__dirname, 'consolidated-bundle-analysis.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Extract claimed sizes (hacky but works)
const packagesMatch = scriptContent.match(/const packages = \[([\s\S]*?)\];/);
if (!packagesMatch) {
  console.error(
    '❌ Could not parse package config from consolidated-bundle-analysis.js'
  );
  process.exit(1);
}

const packagesCode = packagesMatch[0];
const claimedSizes = new Map();

// Parse out claimed sizes
const claimMatches = packagesCode.matchAll(
  /name: '([^']+)'[\s\S]*?claimed: (\d+)/g
);
for (const match of claimMatches) {
  const [, name, claimed] = match;
  claimedSizes.set(name, parseInt(claimed, 10));
}

console.log('🔍 Verifying Size Claims Against Actual Package Contents\n');
console.log('='.repeat(70));

function getGzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function findJsFiles(dir) {
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function measurePackage(packageName) {
  const packageDir = path.join(process.cwd(), `dist/packages/${packageName}`);

  if (!fs.existsSync(packageDir)) {
    return null;
  }

  const jsFiles = findJsFiles(packageDir);
  if (jsFiles.length === 0) return null;

  const allContent = jsFiles.map((f) => fs.readFileSync(f)).join('\n');
  const buffer = Buffer.from(allContent);

  return {
    fileCount: jsFiles.length,
    rawSize: buffer.length,
    gzipSize: getGzipSize(buffer),
  };
}

const packages = ['core', 'enterprise', 'callable-syntax', 'shared'];
let hasErrors = false;
const results = [];

packages.forEach((pkgName) => {
  const claimed = claimedSizes.get(pkgName);
  const actual = measurePackage(pkgName);

  if (!actual) {
    console.log(`⚠️  ${pkgName}: No build output found (skipping)`);
    return;
  }

  if (!claimed) {
    console.log(`⚠️  ${pkgName}: No claimed size found in script`);
    return;
  }

  const actualKb = (actual.gzipSize / 1024).toFixed(2);
  const claimedKb = (claimed / 1024).toFixed(2);
  const diffBytes = actual.gzipSize - claimed;
  const diffPercent = ((diffBytes / claimed) * 100).toFixed(1);

  const status = Math.abs(diffPercent) <= 5 ? '✅' : '❌';
  const offBy =
    diffBytes > 0
      ? `over by ${Math.abs(diffPercent)}%`
      : `under by ${Math.abs(diffPercent)}%`;

  console.log(`${status} ${pkgName}:`);
  console.log(`   Actual: ${actualKb}KB (${actual.fileCount} files)`);
  console.log(`   Claimed: ${claimedKb}KB`);

  if (Math.abs(diffPercent) > 5) {
    console.log(
      `   ❌ CLAIM ERROR: ${offBy} (${(diffBytes / 1024).toFixed(2)}KB diff)`
    );
    hasErrors = true;
  } else if (Math.abs(diffPercent) > 2) {
    console.log(`   ⚠️  Minor drift: ${offBy}`);
  }

  console.log();

  results.push({
    package: pkgName,
    actual: actual.gzipSize,
    claimed,
    diffPercent: parseFloat(diffPercent),
  });
});

console.log('='.repeat(70));

if (hasErrors) {
  console.log('\n❌ SIZE CLAIM VERIFICATION FAILED');
  console.log(
    '\nOne or more packages have claimed sizes that differ by >5% from actual.'
  );
  console.log('This usually means:');
  console.log(
    '  1. You measured a barrel file instead of full package contents'
  );
  console.log('  2. Claims need updating after code changes');
  console.log('\nTo fix:');
  console.log('  1. Run: node scripts/consolidated-bundle-analysis.js');
  console.log('  2. Check the "Full Package Analysis" section');
  console.log(
    '  3. Update claimed values in scripts/consolidated-bundle-analysis.js'
  );
  process.exit(1);
}

console.log('\n✅ All size claims verified (within 5% tolerance)');
console.log('\nSummary:');
results.forEach((r) => {
  const arrow = r.diffPercent > 0 ? '↑' : '↓';
  console.log(`  ${r.package}: ${arrow} ${Math.abs(r.diffPercent)}%`);
});

process.exit(0);
