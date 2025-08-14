const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Bundle size validation script for SignalTree packages
 * Validates that packages meet their claimed bundle size targets
 */

const packages = [
  { name: 'core', maxSize: 7800, claimed: 7600 },
  { name: 'batching', maxSize: 1000, claimed: 900 },
  { name: 'memoization', maxSize: 700, claimed: 600 },
  { name: 'time-travel', maxSize: 1500, claimed: 1400 }, // Now without lodash
  { name: 'async', maxSize: 3500, claimed: 3000 },
  { name: 'entities', maxSize: 700, claimed: 600 },
  { name: 'middleware', maxSize: 600, claimed: 500 },
  { name: 'devtools', maxSize: 900, claimed: 800 },
  { name: 'serialization', maxSize: 3000, claimed: 2800 },
  { name: 'ng-forms', maxSize: 1500, claimed: 1400 },
  { name: 'presets', maxSize: 500, claimed: 400 },
];

function getGzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)}KB`;
}

function validatePackages() {
  console.log('📦 SignalTree Package Bundle Size Report\n');
  console.log('==========================================\n');

  let totalFailed = 0;
  let totalPassed = 0;
  let totalSize = 0;
  let totalClaimedSize = 0;

  packages.forEach((pkg) => {
    const distPath = path.join(
      __dirname,
      `../dist/packages/${pkg.name}/fesm2022/signaltree-${pkg.name}.mjs`
    );

    if (!fs.existsSync(distPath)) {
      console.log(`⚠️  ${pkg.name}: Build not found (${distPath})`);
      return;
    }

    const content = fs.readFileSync(distPath);
    const rawSize = content.length;
    const gzipSize = getGzipSize(content);

    const passed = gzipSize <= pkg.maxSize;
    const claimMet = gzipSize <= pkg.claimed;

    if (passed) totalPassed++;
    else totalFailed++;

    totalSize += gzipSize;
    totalClaimedSize += pkg.claimed;

    console.log(`📦 ${pkg.name}:`);
    console.log(`   Raw: ${formatSize(rawSize)}`);
    console.log(`   Gzipped: ${formatSize(gzipSize)}`);
    console.log(`   Claimed: ${formatSize(pkg.claimed)}`);
    console.log(`   Max Allowed: ${formatSize(pkg.maxSize)}`);
    console.log(
      `   Status: ${passed ? '✅ PASS' : '❌ FAIL'} ${
        claimMet ? '(Claim Met)' : '(Claim Exceeded)'
      }`
    );
    console.log();
  });

  console.log('==========================================\n');
  console.log('📊 Summary:');
  console.log(`   Packages Passed: ${totalPassed}/${packages.length}`);
  console.log(`   Packages Failed: ${totalFailed}/${packages.length}`);
  console.log(`   Total Actual Size: ${formatSize(totalSize)}`);
  console.log(`   Total Claimed Size: ${formatSize(totalClaimedSize)}`);
  console.log(
    `   Efficiency: ${
      totalSize <= totalClaimedSize ? '✅ Claims Met' : '❌ Claims Exceeded'
    }`
  );

  if (totalFailed > 0) {
    console.log('\n❌ Some packages exceed their size limits!');
    process.exit(1);
  } else {
    console.log('\n✅ All packages meet their size requirements!');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  validatePackages();
}

module.exports = { validatePackages };
