import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      // NOTE: Tree-shaking test shows barrel imports work fine with modern bundlers.
      // Both patterns produce identical bundles (~9.3KB for core+batching):
      //   import { signalTree, withBatching } from '@signaltree/core';
      //   import { withBatching } from '@signaltree/core/enhancers/batching';
      //
      // Subpath imports are supported for developer preference, but not required.
      // The ESLint rule below is DISABLED by default - enable only if your
      // build tooling has known tree-shaking issues.
      // Uncomment to enforce subpath imports (usually unnecessary):
      // 'no-restricted-imports': [
      //   'warn',
      //   {
      //     paths: [
      //       {
      //         name: '@signaltree/core',
      //         importNames: [
      //           'withBatching', 'withMemoization', 'withDevTools',
      //           'withEntities', 'withSerialization', 'withTimeTravel',
      //           'withMiddleware', 'createAsyncOperation', 'TREE_PRESETS'
      //         ],
      //         message: 'Consider subpath imports like @signaltree/core/enhancers/<name> for explicit control'
      //       }
      //     ]
      //   }
      // ]
    },
  },
];
