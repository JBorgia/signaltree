const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const options = {
  main: './src/index.ts',
  tsConfig: './tsconfig.lib.prod.json',
  outputPath: '../../dist/packages/ng-forms',
  format: ['esm'],
  additionalEntryPoints: [
    './src/core/ng-forms.ts',
    './src/core/validators.ts',
    './src/core/async-validators.ts',
    './src/history/history.ts',
    './src/enhancer/form-bridge.ts',
    './src/audit/audit.ts',
    './src/wizard/wizard.ts',
    './src/signals/index.ts',
  ],
  assets: [
    {
      input: 'packages/ng-forms',
      glob: 'README.md',
      output: '.',
    },
    {
      input: 'packages/ng-forms',
      glob: 'package.json',
      output: '.',
    },
    {
      input: 'packages/ng-forms/src',
      glob: '**/*.d.ts',
      output: './src',
    },
  ],
  deleteOutputPath: true,
  buildLibsFromSource: true,
  generatePackageJson: false,
};

let config = withNx(options, {
  // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
  // e.g.
  // output: { sourcemap: true },
});

config = require('./rollup.custom.mjs').default(config, options);

module.exports = config;
