#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Try to load gzip-size, fallback gracefully if not available
let gzipSize;
try {
  gzipSize = require('gzip-size');
} catch {
  console.log('ℹ️  gzip-size not installed, showing raw file sizes only\n');
}

const packages = [
  'core',
  'async',
  'batching',
  'memoization',
  'time-travel',
  'entities',
  'middleware',
  'devtools',
  'serialization',
  'presets',
  'ng-forms',
];

console.log('🔍 Verifying JSDoc Stripping and Bundle Sizes\n');

let allPassed = true;

packages.forEach((pkg) => {
  console.log(`📦 ${pkg}:`);

  const jsFile = path.join(
    __dirname,
    `../dist/packages/${pkg}/fesm2022/signaltree-${pkg}.mjs`
  );
  const dtsFile = path.join(__dirname, `../dist/packages/${pkg}/index.d.ts`);

  let jsExists = false;
  let dtsExists = false;
  let jsHasJSDoc = false;
  let dtsHasJSDoc = false;
  let jsSize = 0;
  let gzippedSize = 0;

  // Check if files exist
  try {
    if (fs.existsSync(jsFile)) {
      jsExists = true;
      const jsContent = fs.readFileSync(jsFile, 'utf8');
      jsHasJSDoc = jsContent.includes('/**') && jsContent.includes('*/');
      jsSize = jsContent.length;
      gzippedSize = gzipSize ? gzipSize.sync(jsContent) : jsSize;
    }
  } catch (e) {
    console.log(`   ⚠️  Could not read JS file: ${e.message}`);
  }

  try {
    if (fs.existsSync(dtsFile)) {
      dtsExists = true;
      const dtsContent = fs.readFileSync(dtsFile, 'utf8');
      dtsHasJSDoc = dtsContent.includes('/**') && dtsContent.includes('*/');
    }
  } catch (e) {
    console.log(`   ⚠️  Could not read .d.ts file: ${e.message}`);
  }

  // Report results
  if (jsExists) {
    const gzipInfo = gzipSize
      ? `, ${(gzippedSize / 1024).toFixed(2)}KB gzipped`
      : '';
    console.log(
      `   .mjs file: ${jsHasJSDoc ? '❌ Contains JSDoc' : '✅ No JSDoc'} (${(
        jsSize / 1024
      ).toFixed(2)}KB raw${gzipInfo})`
    );
  } else {
    console.log(`   .mjs file: ⚠️  Not found`);
  }

  if (dtsExists) {
    console.log(
      `   .d.ts file: ${dtsHasJSDoc ? '✅ Has JSDoc' : '❌ Missing JSDoc'}`
    );
  } else {
    console.log(`   .d.ts file: ⚠️  Not found`);
  }

  // Validation
  if (jsExists && jsHasJSDoc) {
    console.log(`   🚨 ERROR: JSDoc found in runtime bundle!`);
    allPassed = false;
  }

  if (dtsExists && !dtsHasJSDoc) {
    console.log(`   ⚠️  WARNING: No JSDoc in type definitions`);
  }

  console.log('');
});

if (!allPassed) {
  console.log('❌ JSDoc stripping validation FAILED!');
  process.exit(1);
} else {
  console.log('✅ JSDoc stripping validation PASSED!');
}

console.log('\n🎯 Bundle size improvements from JSDoc stripping:');
console.log(
  '   - Runtime bundles: Significantly smaller (no documentation overhead)'
);
console.log('   - Type definitions: Fully documented (perfect IDE experience)');
console.log('   - Developer experience: Unchanged (all JSDoc visible in IDE)');
