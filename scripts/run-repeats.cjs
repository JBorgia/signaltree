#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(repoRoot, 'artifacts');
const exporter = path.join(
  __dirname,
  'playwright',
  'run-benchmark-export-all.cjs'
);
const library = 'SignalTree';
const modes = ['off', 'light'];
const repeats = 3;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

for (let run = 1; run <= repeats; run++) {
  const order = shuffle(modes.slice());
  console.log(
    `\n=== Repeat ${run}: running modes in order: ${order.join(', ')} ===\n`
  );
  for (const mode of order) {
    console.log(`Starting run ${run} mode=${mode}`);
    try {
      // Run exporter for SignalTree only
      execSync(`MEMO_MODE='${mode}' LIBRARY='${library}' node '${exporter}'`, {
        stdio: 'inherit',
        cwd: repoRoot,
        env: process.env,
      });
    } catch (err) {
      console.error(
        'Exporter failed for',
        mode,
        'on run',
        run,
        err && err.message
      );
      process.exit(2);
    }

    const src = path.join(artifactsDir, `SignalTree-${mode}-results.json`);
    const dest = path.join(artifactsDir, `SignalTree-${mode}-run${run}.json`);
    if (!fs.existsSync(src)) {
      console.error('Expected artifact not found after run:', src);
      process.exit(3);
    }
    fs.copyFileSync(src, dest);
    console.log('Saved run artifact:', dest);
    // small pause between runs
    execSync('sleep 1');
  }
}
console.log('\nAll repeats complete');
