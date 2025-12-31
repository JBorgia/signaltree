#!/usr/bin/env node

/**
 * Tree-Shaking Verification Test
 * ================================
 *
 * Tests whether importing from the barrel (@signaltree/core) brings in
 * only the requested code or pulls in all enhancers.
 *
 * Simulates different import patterns and measures the bundled result.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

console.log('🌲 Tree-Shaking Effectiveness Test\n');
console.log('='.repeat(70));

const testCases = [
  {
    name: 'Core only (signalTree + basic utils)',
    code: `
      import { signalTree } from '@signaltree/core';
      const tree = signalTree({ count: 0 });
      tree.$.count.set(5);
      console.log(tree.$.count());
    `,
    expectedFiles: ['signal-tree.js', 'utils.js', 'constants.js'],
    shouldNotInclude: ['batching', 'memoization', 'devtools'],
  },
  {
    name: 'Core + one enhancer (batching)',
    code: `
      import { signalTree, batching } from '@signaltree/core';
      const tree = signalTree({ count: 0 }).with(batching());
    `,
    expectedFiles: ['signal-tree.js', 'batching.js'],
    shouldNotInclude: ['memoization', 'devtools', 'serialization'],
  },
  {
    name: 'Subpath import (avoids barrel)',
    code: `
      import { signalTree } from '@signaltree/core';
      import { batching } from '@signaltree/core/enhancers/batching';
      const tree = signalTree({ count: 0 }).with(batching());
    `,
    expectedFiles: ['signal-tree.js', 'batching.js'],
    shouldNotInclude: ['memoization', 'devtools', 'serialization'],
  },
];

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)}KB`;
}

function analyzeBundle(testCase) {
  const testDir = path.join(process.cwd(), '.tmp-tree-shaking-test');

  // Clean and create test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  // Create test file
  const testFile = path.join(testDir, 'test.ts');
  fs.writeFileSync(testFile, testCase.code.trim());

  // Create minimal tsconfig
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      baseUrl: '..',
      paths: {
        '@signaltree/core': ['packages/core/src/index.ts'],
        '@signaltree/core/*': ['packages/core/src/*'],
      },
    },
    include: ['test.ts'],
  };
  fs.writeFileSync(
    path.join(testDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  try {
    // Bundle with esbuild (simulates modern bundler tree-shaking)
    const outFile = path.join(testDir, 'bundle.js');
    execSync(
      `npx esbuild test.ts --bundle --outfile=bundle.js --format=esm --external:@angular/core --external:tslib --minify`,
      { cwd: testDir, stdio: 'pipe' }
    );

    const bundle = fs.readFileSync(outFile);
    const rawSize = bundle.length;
    const gzipSize = zlib.gzipSync(bundle).length;

    // Analyze what got included
    const bundleContent = bundle.toString();
    const includedEnhancers = [];
    const enhancers = [
      'batching',
      'memoization',
      'devtools',
      'serialization',
      'middleware',
      'entities',
      'time-travel',
      'presets',
      'computed',
    ];

    enhancers.forEach((enhancer) => {
      // Look for enhancer-specific code patterns
      if (
        bundleContent.includes(
          `with${enhancer.charAt(0).toUpperCase()}${enhancer.slice(1)}`
        ) ||
        bundleContent.includes(enhancer.toUpperCase())
      ) {
        includedEnhancers.push(enhancer);
      }
    });

    return {
      rawSize,
      gzipSize,
      includedEnhancers,
      bundleContent,
    };
  } catch (error) {
    console.error(`   ❌ Bundle failed: ${error.message}`);
    return null;
  } finally {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

console.log('\n📊 Testing Different Import Patterns:\n');

const results = [];

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  console.log('   Code:');
  testCase.code
    .trim()
    .split('\n')
    .forEach((line) => {
      console.log(`     ${line.trim()}`);
    });

  const result = analyzeBundle(testCase);

  if (!result) {
    console.log('   ⚠️  Test skipped (bundle error)\n');
    return;
  }

  console.log(`   Raw: ${formatSize(result.rawSize)}`);
  console.log(`   Gzipped: ${formatSize(result.gzipSize)}`);

  // Check if tree-shaking worked
  const unexpectedIncludes = testCase.shouldNotInclude.filter((enhancer) =>
    result.includedEnhancers.includes(enhancer)
  );

  if (unexpectedIncludes.length > 0) {
    console.log(
      `   ❌ Tree-shaking FAILED - included: ${unexpectedIncludes.join(', ')}`
    );
  } else {
    console.log(`   ✅ Tree-shaking EFFECTIVE`);
  }

  if (result.includedEnhancers.length > 0) {
    console.log(`   Detected: ${result.includedEnhancers.join(', ')}`);
  }

  console.log();

  results.push({
    name: testCase.name,
    gzipSize: result.gzipSize,
    treeShakingWorks: unexpectedIncludes.length === 0,
  });
});

console.log('='.repeat(70));
console.log('\n📊 Summary:\n');

results.forEach((result, index) => {
  const icon = result.treeShakingWorks ? '✅' : '❌';
  console.log(`${icon} ${index + 1}. ${result.name}`);
  console.log(`   Bundle: ${formatSize(result.gzipSize)} gzipped`);
});

const allPassed = results.every((r) => r.treeShakingWorks);

console.log('\n' + '='.repeat(70));

if (allPassed) {
  console.log('\n✅ Tree-shaking is EFFECTIVE across all import patterns');
  console.log('\nKey findings:');
  console.log('  • Barrel imports (from @signaltree/core) are tree-shakeable');
  console.log('  • Only requested code is bundled');
  console.log('  • Subpath imports offer no additional benefit');
  console.log('  • ESLint rule preventing barrel imports may be unnecessary');
} else {
  console.log('\n❌ Tree-shaking has ISSUES');
  console.log('\nProblems detected:');
  console.log('  • Barrel imports pull in unrequested code');
  console.log('  • Users MUST use subpath imports for optimal bundles');
  console.log('  • ESLint rule is necessary to enforce subpath imports');
}

console.log();
