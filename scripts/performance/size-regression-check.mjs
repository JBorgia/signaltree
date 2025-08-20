#!/usr/bin/env node
/**
 * Size Regression Guard
 *
 * Compares latest size snapshot against baseline and fails (exit 1) if gzip size
 * exceeds allowed growth percentage (default 5%). Use --update-baseline to accept.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  sizeLatestPath,
  sizeBaselinePath,
  ensurePerformanceDirs,
} from './paths.mjs';

ensurePerformanceDirs();
const latestPath = sizeLatestPath();
const baselinePath = sizeBaselinePath();
const threshold = Number(process.env.MAX_SIZE_GROWTH_PCT || 5); // percent
const update = process.argv.includes('--update-baseline');

function ensureLatest() {
  try {
    readFileSync(latestPath);
  } catch {
    console.log('[size-check] Generating latest size snapshot...');
    execSync('node scripts/performance/size-snapshot.mjs', {
      stdio: 'inherit',
    });
  }
}

function load(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function saveBaseline(data) {
  writeFileSync(baselinePath, JSON.stringify(data, null, 2));
}

ensureLatest();
const latest = load(latestPath);

if (update) {
  saveBaseline(latest);
  console.log('[size-check] Baseline updated. gzip=' + latest.gzip + ' bytes');
  process.exit(0);
}

let baseline;
try {
  baseline = load(baselinePath);
} catch {
  saveBaseline(latest);
  console.log(
    '[size-check] No baseline found. Created baseline (gzip=' +
      latest.gzip +
      ').'
  );
  process.exit(0);
}

const delta = latest.gzip - baseline.gzip;
const deltaPct = baseline.gzip === 0 ? 0 : (delta / baseline.gzip) * 100;

console.log('\nSize Regression Report (threshold ' + threshold + '% growth)');
console.log('Baseline gzip:', baseline.gzip, 'bytes');
console.log('Latest   gzip:', latest.gzip, 'bytes');
console.log(
  'Delta    gzip:',
  delta >= 0 ? '+' + delta : String(delta),
  'bytes (' + (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(2) + '%)'
);

if (deltaPct > threshold) {
  console.error(
    '\n[size-check] FAILURE: gzip size growth exceeds ' + threshold + '%.'
  );
  console.error('Use --update-baseline to accept if intentional.');
  process.exit(1);
}
console.log('\n[size-check] Success: No size regression beyond threshold.');
process.exit(0);
