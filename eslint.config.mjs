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
    rules: {},
  },
  // Enforce core neutrality: forbid direct '@angular/core' imports inside core package except adapter layer
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/lib/adapter.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/core',
              message:
                'Do not import from @angular/core directly in core. Use ./lib/adapter instead.',
            },
          ],
          patterns: [
            {
              group: ['@angular/core/*'],
              message:
                'Do not import from @angular/core/* directly in core. Use ./lib/adapter instead.',
            },
          ],
        },
      ],
    },
  },
];
