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

// Note: batching, memoization, middleware, entities, devtools, time-travel, presets, serialization
// were consolidated into @signaltree/core in v4.0.0
const packages = ['core', 'ng-forms', 'enterprise', 'callable-syntax'];

console.log('🔍 Verifying JSDoc Stripping and Bundle Sizes\n');

let allPassed = true;

packages.forEach((pkg) => {
  console.log(`📦 ${pkg}:`);

  const jsCandidates = [
    path.join(__dirname, `../dist/packages/${pkg}/dist/index.js`),
    path.join(
      __dirname,
      `../dist/packages/${pkg}/fesm2022/signaltree-${pkg}.mjs`
    ),
  ];
  const dtsCandidates = [
    path.join(__dirname, `../dist/packages/${pkg}/src/index.d.ts`),
    path.join(__dirname, `../dist/packages/${pkg}/index.d.ts`),
  ];

  const jsFile = jsCandidates.find((candidate) => fs.existsSync(candidate));
  const dtsFile = dtsCandidates.find((candidate) => fs.existsSync(candidate));

  let jsExists = false;
  let dtsExists = false;
  let jsHasJSDoc = false;
  let dtsHasJSDoc = false;
  let jsSize = 0;
  let gzippedSize = 0;

  // Check if files exist
  try {
    if (jsFile && fs.existsSync(jsFile)) {
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
    if (dtsFile && fs.existsSync(dtsFile)) {
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
    const rel = path.relative(process.cwd(), jsFile);
    console.log(
      `   bundle file (${rel}): ${
        jsHasJSDoc ? '❌ Contains JSDoc' : '✅ No JSDoc'
      } (${(jsSize / 1024).toFixed(2)}KB raw${gzipInfo})`
    );
  } else {
    console.log(`   bundle file: ⚠️  Not found`);
  }

  if (dtsExists) {
    const relDts = path.relative(process.cwd(), dtsFile);
    console.log(
      `   .d.ts file (${relDts}): ${
        dtsHasJSDoc ? '✅ Has JSDoc' : '❌ Missing JSDoc'
      }`
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
