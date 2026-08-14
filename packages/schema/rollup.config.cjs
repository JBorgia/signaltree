const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const options = {
  main: './src/index.ts',
  tsConfig: './tsconfig.lib.prod.json',
  outputPath: '../../dist/packages/schema',
  format: ['esm'],
  assets: [
    {
      input: 'packages/schema',
      glob: 'README.md',
      output: '.',
    },
    {
      input: 'packages/schema',
      glob: 'CHANGELOG.md',
      output: '.',
    },
    {
      input: 'packages/schema',
      glob: 'package.json',
      output: '.',
    },
    {
      input: 'packages/schema/src',
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
