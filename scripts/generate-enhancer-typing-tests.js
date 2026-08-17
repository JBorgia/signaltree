const fs = require('fs');
const path = require('path');

const out = path.join(
  __dirname,
  '../packages/core/src/enhancers/typing/all-subsets.generated.spec.ts'
);

// Kept in sync with the REAL interfaces in packages/core/src/lib/types.ts.
//
// This list rotted badly and nothing noticed, because a type-level test that is
// not type-checked is not a test: vitest strips types without checking them,
// and the typecheck gate excluded specs. The generated file carried 201 type
// errors. What was wrong:
//
//   - every importPath pointed at `enhancers/<name>/lib/<name>`, a layout that
//     stopped existing when the enhancers were flattened; all four interfaces
//     actually live in `lib/types`;
//   - `BatchingMethods` was asserted to have `batchUpdate`, which has never
//     existed (there is a `batchUpdates?: boolean` CONFIG flag, different
//     thing);
//   - an entire `EntitiesMethods` enhancer was modelled, and it does not exist
//     — entities became the `entityMap()` MARKER, so there is no enhancer to
//     compose.
//
// `generic` matters: DevToolsMethods takes no type parameter, so emitting
// `DevToolsMethods<Tree>` is an error rather than a harmless flourish.
const enhancers = [
  {
    id: 'A',
    name: 'Batching',
    importPath: '../../lib/types',
    typeName: 'BatchingMethods',
    generic: false,
    methods: ['batch', 'coalesce', 'hasPendingNotifications', 'flushNotifications'],
  },
  {
    id: 'C',
    name: 'TimeTravel',
    importPath: '../../lib/types',
    typeName: 'TimeTravelMethods',
    generic: true,
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
    importPath: '../../lib/types',
    typeName: 'DevToolsMethods',
    generic: false,
    methods: ['connectDevTools', 'disconnectDevTools'],
  },
  // The 'F' / OptimizedUpdate entry was removed in 14.1.2 along with
  // `OptimizedUpdateMethods` itself: it typed `@signaltree/enterprise`'s diff
  // engine, and that package was dropped in 14.0.0. Nothing implemented the
  // interface, so these subsets were exercising a type no tree could satisfy.
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
  const typeNames = subset
    .map((s) => (s.generic ? `${s.typeName}<Tree>` : s.typeName))
    .join(' & ');
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
