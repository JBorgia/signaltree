#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function fileHas(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

console.log('\n\ud83e\uddea Running workspace sanity checks (smoke/parity)');

const checks = [];

checks.push(() => {
  const p = 'packages/core/src/lib/tree.ts';
  const c = fileHas(p);
  return c && c.includes('signalTree')
    ? [true, 'core tree exists']
    : [false, `missing or incomplete ${p}`];
});

checks.push(() => {
  const p = 'packages/core/src/enhancers/batching/index.ts';
  const c = fileHas(p);
  return c && c.includes('withBatching')
    ? [true, 'batching enhancer present in core']
    : [false, `missing or incomplete ${p}`];
});

checks.push(() => {
  const p = 'packages/enterprise/src/lib/enterprise-enhancer.ts';
  const c = fileHas(p);
  return c && c.includes('withEnterprise')
    ? [true, 'enterprise package present']
    : [false, `missing or incomplete ${p}`];
});

checks.push(() => {
  const p =
    'apps/demo/src/app/components/modular-examples/modular-examples.component.ts';
  const c = fileHas(p);
  return c && c.includes('signalTree')
    ? [true, 'demo integration present']
    : [false, `missing demo component ${p}`];
});

let failed = 0;
for (const fn of checks) {
  const [ok, msg] = fn();
  if (ok) console.log('  \u2705', msg);
  else {
    console.error('  \u274c', msg);
    failed++;
  }
}

if (failed > 0) {
  console.error('\n\u274c Sanity checks failed');
  process.exit(1);
}

console.log('\n\u2705 Sanity checks passed');
