const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Bundle size validation script for SignalTree packages
 * Validates that packages meet their claimed bundle size targets
 */

const packages = [
  { name: 'core', maxSize: 5300, claimed: 5100 }, // Actual: 5.08KB
  { name: 'batching', maxSize: 1200, claimed: 1100 }, // Actual: 1.07KB
  { name: 'memoization', maxSize: 1800, claimed: 1700 }, // Actual: 1.69KB
  { name: 'time-travel', maxSize: 1700, claimed: 1600 }, // Actual: 1.54KB
  { name: 'async', maxSize: 1900, claimed: 1800 }, // Actual: 1.71KB
  { name: 'entities', maxSize: 1000, claimed: 950 }, // Actual: 0.91KB
  { name: 'middleware', maxSize: 1300, claimed: 1200 }, // Actual: 1.15KB
  { name: 'devtools', maxSize: 2500, claimed: 2400 }, // Actual: 2.28KB
  { name: 'serialization', maxSize: 3800, claimed: 3700 }, // Actual: 3.63KB (optimized!)
  { name: 'ng-forms', maxSize: 3600, claimed: 3500 }, // Actual: 3.39KB
  { name: 'presets', maxSize: 600, claimed: 550 }, // Actual: 0.52KB
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
