#!/usr/bin/env node
/**
 * 🚀 SignalTree Performance Runner
 *
 * This is a simple entry point that runs the comprehensive performance analysis.
 * The actual implementation has been moved to scripts/performance/ for better organization.
 */

console.log('🚀 SignalTree Performance Runner');
console.log('📁 Running comprehensive performance analysis...\n');

// Import and run the comprehensive performance suite
const { spawn } = require('child_process');
const path = require('path');

const performanceScript = path.join(__dirname, 'recursive-performance.js');

const child = spawn('node', [performanceScript], {
  stdio: 'inherit',
  cwd: __dirname,
});

child.on('error', (error) => {
  console.error('❌ Failed to run performance analysis:', error.message);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Performance analysis exited with code ${code}`);
    process.exit(code);
  }
  console.log('\n✅ Performance analysis completed successfully!');
});
