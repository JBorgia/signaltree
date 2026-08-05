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
      // Throwaway probe/audit specs. Investigating a defect here means dropping
      // a scratch spec next to the code (vitest only collects specs inside a
      // package), so these appear and vanish constantly. Already gitignored;
      // ignored here too so a probe in flight cannot fail the lint gate. A test
      // worth keeping gets a real name and is not matched by this pattern.
      '**/zz-*.ts',
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
        {
          // Mechanises the ONE invariant `resolveChild()` depends on.
          //
          // Resolution of an untrusted key is an own-property check, which is
          // sufficient ONLY while nothing mints an own `__proto__` on a node —
          // once such a key exists, own-ness is satisfied forever after and the
          // guard is inert. That is the exact two-call bypass an audit used to
          // defeat an earlier fix in @signaltree/enterprise, where a
          // defineProperty write created the key that unlocked the check.
          //
          // A computed key is where that can happen, so a computed key has to
          // be a deliberate, annotated act. Every current site iterates
          // TREE-derived keys (Object.keys of a node) and is fine; the rule
          // exists so a new one cannot be added quietly. Suppress with an
          // eslint-disable-next-line and a comment saying where the key comes
          // from.
          selector:
            'CallExpression[callee.object.name="Object"][callee.property.name="defineProperty"]:not([arguments.1.type="Literal"]):not([arguments.1.type="Identifier"][arguments.1.name=/_SYMBOL$|^Symbol/])',
          message:
            'Object.defineProperty with a computed key can MINT an own `__proto__`, which permanently defeats the own-property check in resolveChild(). Confirm the key is tree-derived (never from a payload), then suppress with a comment saying so. See packages/core/src/lib/internals/resolve-child.ts.',
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
