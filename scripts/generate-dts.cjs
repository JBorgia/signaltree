#!/usr/bin/env node
// Generate declaration-only outputs with comments preserved for packages (CommonJS)
const child_process = require('child_process');
const path = require('path');

const pkgs = process.argv.slice(2);
if (pkgs.length === 0) {
  console.log('Usage: node scripts/generate-dts.cjs <pkg1> <pkg2> ...');
  process.exit(1);
}

for (const pkg of pkgs) {
  const tsconfig = path.join('packages', pkg, 'tsconfig.lib.json');
  console.log(`Generating declarations for ${pkg} using ${tsconfig}`);
  const args = [
    '-p',
    tsconfig,
    '--declaration',
    '--emitDeclarationOnly',
    '--removeComments',
    'false',
    '--skipLibCheck',
  ];
  const res = child_process.spawnSync('npx', ['tsc', ...args], {
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    console.error(`Failed to generate declarations for ${pkg}`);
    process.exit(res.status || 1);
  }
}

console.log('Declaration generation complete');
