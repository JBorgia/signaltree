const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const options = {
  main: './src/index.ts',
  tsConfig: './tsconfig.lib.prod.json',
  outputPath: '../../dist/packages/realtime',
  format: ['esm'],
  additionalEntryPoints: ['./src/supabase/index.ts'],
  assets: [
    {
      input: 'packages/realtime',
      glob: 'README.md',
      output: '.',
    },
    {
      input: 'packages/realtime',
      glob: 'package.json',
      output: '.',
    },
    {
      input: 'packages/realtime/src',
      glob: '**/*.d.ts',
      output: './src',
    },
  ],
  external: [
    '@angular/core',
    '@signaltree/core',
    '@supabase/supabase-js',
    'firebase',
    'tslib',
    'rxjs',
  ],
  deleteOutputPath: true,
  generatePackageJson: false,
};

let config = withNx(options, {
  // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
  // e.g.
  // output: { sourcemap: true },
});

config = require('./rollup.custom.mjs').default(config, options);

module.exports = config;
