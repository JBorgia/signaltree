const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const options = {
  main: './src/index.ts',
  tsConfig: './tsconfig.lib.prod.json',
  outputPath: '../../dist/packages/shared',
  format: ['esm'],
  assets: [
    {
      input: 'packages/shared',
      glob: 'README.md',
      output: '.',
    },
    {
      input: 'packages/shared',
      glob: 'package.json',
      output: '.',
    },
    {
      input: 'packages/shared/src',
      glob: '**/*.d.ts',
      output: './src',
    },
  ],
  deleteOutputPath: true,
  buildLibsFromSource: false,
  generatePackageJson: false,
};

let config = withNx(options, {
  // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
  // e.g.
  // output: { sourcemap: true },
});

config = require('./rollup.custom.mjs').default(config, options);

module.exports = config;
