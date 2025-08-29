#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function run(cmd, args = []) {
  const res = child_process.spawnSync(cmd, args, { stdio: 'inherit' });
  return res.status === 0;
}

const argv = process.argv.slice(2);
const doJsdoc = argv.includes('--jsdoc');
const doSizes = argv.includes('--sizes');

if (!doJsdoc && !doSizes) {
  console.log('\u2139\ufe0f Usage: node scripts/ci-checks.js --jsdoc --sizes');
  process.exit(0);
}

if (doJsdoc) {
  console.log('\n\ud83d\udd0d Running JSDoc stripping validation...');
  const jsdocScript = path.join(__dirname, 'verify-jsdoc-stripping.js');
  if (!fs.existsSync(jsdocScript)) {
    console.warn('   \u26a0 verify-jsdoc-stripping.js not found, skipping');
  } else {
    const ok = run('node', [jsdocScript]);
    if (!ok) {
      console.error('   \u274c JSDoc validation failed');
      process.exit(1);
    }
  }
}

if (doSizes) {
  console.log('\n\ud83d\udcca Running bundle size report...');
  const sizeScript = path.join(__dirname, 'bundle-size-report.js');
  if (!fs.existsSync(sizeScript)) {
    console.warn('   \u26a0 bundle-size-report.js not found, skipping');
  } else {
    const ok = run('node', [sizeScript]);
    if (!ok) {
      console.error('   \u274c Bundle size validation failed');
      process.exit(1);
    }
  }
}

console.log('\n\u2705 CI checks completed successfully');
