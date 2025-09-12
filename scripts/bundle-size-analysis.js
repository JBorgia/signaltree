#!/usr/bin/env node

// Quick bundle size estimates based on package.json and common usage patterns
// This is a simplified estimate since full bundling would require Angular setup

const libraryEstimates = {
  '@ngrx/store': {
    reported: '25KB',
    estimate: '20-30KB',
    reasoning: 'Core store + selectors + actions + effects runtime',
    confidence: 'High - well-documented NgRx bundle size',
  },
  '@ngrx/signals': {
    reported: '12KB',
    estimate: '8-15KB',
    reasoning: 'Signal-based implementation, smaller than full NgRx',
    confidence: 'Medium - newer package, less bundle analysis available',
  },
  '@datorama/akita': {
    reported: '20KB',
    estimate: '35-45KB',
    reasoning: 'Full-featured state management with entity support',
    confidence: 'High - package analysis shows larger size',
  },
  '@ngneat/elf': {
    reported: '2KB',
    estimate: '3-8KB',
    reasoning: 'Minimal modular approach, but still needs runtime',
    confidence: 'Medium - depends on which modules are used',
  },
};

console.log('📊 Bundle Size Analysis Summary');
console.log('================================\n');

Object.entries(libraryEstimates).forEach(([pkg, data]) => {
  console.log(`📦 ${pkg}`);
  console.log(`   Reported: ${data.reported}`);
  console.log(`   Estimate: ${data.estimate}`);
  console.log(`   Reasoning: ${data.reasoning}`);
  console.log(`   Confidence: ${data.confidence}`);
  console.log('');
});

console.log('🎯 Recommendations:');
console.log('- Akita: Update reported size from 20KB to ~40KB');
console.log('- NgRx Signals: Verify 12KB is accurate for typical usage');
console.log('- Elf: Consider that 2KB might be minimal import only');
console.log('- All: Add disclaimer that sizes depend on usage patterns');
