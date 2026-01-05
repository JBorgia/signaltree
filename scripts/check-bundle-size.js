#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const statsPath =
  process.argv[2] ||
  path.join(process.cwd(), 'dist', 'apps', 'demo', 'stats.json');
const threshold = Number(
  process.env.BUNDLE_THRESHOLD || process.env.THRESHOLD || 70000
);

if (!fs.existsSync(statsPath)) {
  console.error(`Stats file not found at ${statsPath}`);
  process.exit(1);
}

const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
const keys = Object.keys(stats.inputs || {});
let sum = 0;
keys.forEach((k) => {
  const obj = stats.inputs[k];
  sum += obj && obj.bytes ? obj.bytes : 0;
});

console.log(`Total bytes for inputs: ${sum} bytes`);
console.log(`Threshold: ${threshold} bytes`);
if (sum > threshold) {
  console.error('Bundle size threshold exceeded');
  process.exit(2);
}

console.log('Bundle size check passed');
process.exit(0);
