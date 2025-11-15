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
      // Guard against importing heavy enhancers from the root barrel.
      // Prefer subpath imports like `@signaltree/core/enhancers/batching`.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@signaltree/core',
              importNames: [
                'withBatching',
                'withHighPerformanceBatching',
                'flushBatchedUpdates',
                'hasPendingUpdates',
                'getBatchQueueSize',
                'withMemoization',
                'withSelectorMemoization',
                'withComputedMemoization',
                'withDeepStateMemoization',
                'withHighFrequencyMemoization',
                'withHighPerformanceMemoization',
                'withLightweightMemoization',
                'withShallowMemoization',
                'memoize',
                'memoizeShallow',
                'memoizeReference',
                'cleanupMemoizationCache',
                'clearAllCaches',
                'getGlobalCacheStats',
                'withTimeTravel',
                'enableTimeTravel',
                'getTimeTravel',
                'withEntities',
                'enableEntities',
                'withHighPerformanceEntities',
                'withSerialization',
                'enableSerialization',
                'withPersistence',
                'createStorageAdapter',
                'createIndexedDBAdapter',
                'applySerialization',
                'applyPersistence',
                'withDevTools',
                'enableDevTools',
                'withFullDevTools',
                'withProductionDevTools',
                'withMiddleware',
                'createLoggingMiddleware',
                'createValidationMiddleware',
                'createAsyncOperation',
                'trackAsync',
                'TREE_PRESETS',
                'createPresetConfig',
                'validatePreset',
                'getAvailablePresets',
                'combinePresets',
                'createDevTree',
                'computedEnhancer',
                'createComputed',
              ],
              message:
                'Import enhancers via subpaths, e.g. @signaltree/core/enhancers/<name> to keep bundles lean.',
            },
          ],
        },
      ],
    },
  },
];
