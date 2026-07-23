import nx from '@nx/eslint-plugin';
import jsoncParser from 'jsonc-eslint-parser';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/.angular', // Angular/Vite build cache — generated, never source
      '**/.nx', // Nx cache — generated
      '**/.versus', // local Versus tooling (gitignored)
      '**/tmp', // scratch dir (gitignored)
      'scripts/ai-codegen-benchmark/results/**', // raw LLM outputs, malformed by design
    ],
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
    // Ban hand-rolled traversable-node guards outside the shared predicate.
    // NodeAccessors and leaf signals are `typeof 'function'`; a walker guard
    // that pairs a typeof-'object' check with a typeof-'function' check in one
    // logical expression is re-deriving isTraversableNode() by hand — the bug
    // class behind the v11.4/11.5 inert-feature regressions (batching,
    // enterprise diff/patch, updateOptimized). AST-based, so quote style,
    // `==` vs `===`, and line wrapping can't dodge it (the deleted bash-grep
    // predecessor was dodged by all three and never flagged anything).
    // Known limitation: esquery cannot bind the two typeof operands to the
    // SAME variable, so `typeof opts === 'object' && typeof cb === 'function'`
    // (different variables) also flags — zero in-tree instances today; if one
    // ever appears legitimately, eslint-disable-next-line it with a comment.
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.spec.ts', 'packages/core/src/lib/utils.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'LogicalExpression:has(BinaryExpression[operator=/^[!=]==?$/]:has(UnaryExpression[operator="typeof"]) > Literal[value="object"]):has(BinaryExpression[operator=/^[!=]==?$/]:has(UnaryExpression[operator="typeof"]) > Literal[value="function"]) BinaryExpression[operator=/^[!=]==?$/]:has(UnaryExpression[operator="typeof"]) > Literal[value="object"]',
          message:
            "Hand-rolled 'object or function' walker guard — use isTraversableNode() from @signaltree/core (packages/core/src/lib/utils.ts) instead. See docs/rfcs/0004-v12-optimal-iteration.md §3 V-P1.",
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
      //   import { signalTree, batching } from '@signaltree/core';
      //   import { batching } from '@signaltree/core/enhancers/batching';
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
      //           'batching', 'memoization', 'devTools',
      //           'entities', 'serialization', 'timeTravel',
      //           'middleware', 'createAsyncOperation', 'TREE_PRESETS'
      //         ],
      //         message: 'Consider subpath imports like @signaltree/core/enhancers/<name> for explicit control'
      //       }
      //     ]
      //   }
      // ]
    },
  },
  {
    files: ['**/package.json'],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredDependencies: [
            'tslib',
            // vitest is a test framework - should stay in devDependencies
            'vitest',
            // @signaltree/shared is bundled at build time via Rollup, not a
            // runtime dependency (matches the per-package eslint configs).
            '@signaltree/shared',
            // @nx/devkit is build/tooling-only.
            '@nx/devkit',
          ],
        },
      ],
    },
  },
  {
    files: ['docs/guardrails/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': 'off',
      'prefer-const': 'off',
    },
  },
];
