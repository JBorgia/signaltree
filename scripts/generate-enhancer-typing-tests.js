const fs = require('fs');
const path = require('path');

const out = path.join(
  __dirname,
  '../packages/core/src/enhancers/typing/all-subsets.generated.spec.ts'
);

const enhancers = [
  {
    id: 'A',
    name: 'Batching',
    importPath: '../batching/lib/batching',
    typeName: 'BatchingMethods',
    methods: ['batch', 'batchUpdate'],
  },
  {
    id: 'B',
    name: 'Memoization',
    importPath: '../memoization/lib/memoization',
    typeName: 'MemoizationMethods',
    methods: ['memoize', 'memoizedUpdate', 'clearMemoCache', 'getCacheStats'],
  },
  {
    id: 'C',
    name: 'TimeTravel',
    importPath: '../time-travel/lib/time-travel',
    typeName: 'TimeTravelMethods',
    methods: [
      'undo',
      'redo',
      'canUndo',
      'canRedo',
      'getHistory',
      'resetHistory',
      'jumpTo',
      'getCurrentIndex',
    ],
  },
  {
    id: 'D',
    name: 'DevTools',
    importPath: '../devtools/lib/devtools',
    typeName: 'DevToolsMethods',
    methods: ['connectDevTools', 'disconnectDevTools'],
  },
  {
    id: 'E',
    name: 'Entities',
    importPath: '../entities/lib/entities',
    typeName: 'EntitiesMethods',
    methods: ['entities'],
  },
  {
    id: 'F',
    name: 'OptimizedUpdate',
    importPath: '../../lib/types',
    typeName: 'OptimizedUpdateMethods',
    methods: ['updateOptimized'],
  },
];

function powerset(arr) {
  const res = [];
  const n = arr.length;
  for (let i = 1; i < 1 << n; i++) {
    const subset = [];
    for (let j = 0; j < n; j++) if (i & (1 << j)) subset.push(arr[j]);
    res.push(subset);
  }
  return res;
}

const subsets = powerset(enhancers);

let content = `// GENERATED FILE - do not edit by hand
// Comprehensive type-level checks for enhancer subsets
import type { Equals, Assert } from './helpers-types';
import type { SignalTree } from '../../lib/types';
type Tree = { count: number };
`;

// Add imports
const imports = new Map();
enhancers.forEach((e) => imports.set(e.importPath, []));
enhancers.forEach((e) => imports.get(e.importPath).push(e.typeName));
for (const [imp, types] of imports.entries()) {
  content += `import type { ${types.join(', ')} } from '${imp}';\n`;
}

content += `\n// Helper to detect method presence\ntype HasMethod<T, K extends string> = K extends keyof T ? true : false;\n\n`;

subsets.forEach((subset) => {
  const ids = subset.map((s) => s.id).join('');
  const typeNames = subset.map((s) => `${s.typeName}<Tree>`).join(' & ');
  content += `type Subset_${ids} = ${typeNames};\n`;
  // For each method across all enhancers, assert presence equals whether subset provides it
  const allMethods = enhancers.flatMap((e) =>
    e.methods.map((m) => ({ m, provider: e.id }))
  );
  for (const { m } of allMethods) {
    const provided = subset.some((s) => s.methods.includes(m));
    content += `type Subset_${ids}_has_${m} = Assert<Equals<HasMethod<Subset_${ids}, '${m}'>, ${
      provided ? 'true' : 'false'
    }>>;\n`;
  }
  content += '\n';
});

// Add trivial export
content += '\nexport {};' + '\n';

// Write helper types file
const helpers = `// Helper types for generated tests\nexport type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;\nexport type Assert<T extends true> = T;\n`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  path.join(path.dirname(out), 'helpers-types.ts'),
  helpers,
  'utf8'
);
fs.writeFileSync(out, content, 'utf8');
console.log('Generated', out);
