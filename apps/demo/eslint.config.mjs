import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          // 'st' is the intentional prefix for the reusable st-example
          // playground toolkit (st-example, st-code-tabs, …); 'app' for
          // everything else.
          prefix: ['app', 'st'],
          style: 'kebab-case',
        },
      ],
      // The Angular 22 migration stamped explicit
      // `ChangeDetectionStrategy.Eager` on every demo component that relied
      // on the old implicit default, to preserve runtime behavior. Converting
      // the demo app to OnPush wholesale is tracked separately; until then
      // this rule would flag ~50 behavior-preserving stamps.
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
