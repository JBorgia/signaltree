const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const options = {
  main: './src/index.ts',
  additionalEntryPoints: [
    './src/security.ts',
    './src/lazy.ts',
    './src/edit-session.ts',
    './src/storage.ts',
    './src/authoring.ts',
  ],
  tsConfig: './tsconfig.lib.prod.json',
  outputPath: '../../dist/packages/core',
  format: ['esm'],
  assets: [
    {
      input: 'packages/core',
      glob: 'README.md',
      output: '.',
    },
    {
      input: 'packages/core',
      glob: 'package.json',
      output: '.',
    },
    {
      input: 'packages/core/src',
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
