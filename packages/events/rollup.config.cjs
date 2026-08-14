const { withNx } = require('@nx/rollup/with-nx');

// These options were migrated by @nx/rollup:convert-to-inferred from project.json
const configValues = {
  default: {
    main: './src/index.ts',
    tsConfig: './tsconfig.lib.prod.json',
    outputPath: '../../dist/packages/events',
    format: ['esm'],
    additionalEntryPoints: [
      './src/nestjs/index.ts',
      './src/angular/index.ts',
      './src/testing/index.ts',
    ],
    generateExportsField: false,
    assets: [
      {
        input: 'packages/events',
        glob: 'README.md',
        output: '.',
      },
      {
        input: 'packages/events',
        glob: 'package.json',
        output: '.',
      },
      {
        input: 'packages/events/src',
        glob: '**/*.d.ts',
        output: './src',
      },
    ],
    external: [
      '@angular/core',
      '@signaltree/core',
      '@nestjs/common',
      '@nestjs/core',
      'bullmq',
      'ioredis',
      'socket.io-client',
      'zod',
      'tslib',
      'rxjs',
    ],
    deleteOutputPath: true,
    generatePackageJson: false,
  },
  production: {
    tsConfig: 'packages/events/tsconfig.lib.prod.json',
  },
};

// Determine the correct configValue to use based on the configuration
const nxConfiguration = process.env.NX_TASK_TARGET_CONFIGURATION ?? 'default';

const options = {
  ...configValues.default,
  ...configValues[nxConfiguration],
};

let config = withNx(options, {
  // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
  // e.g.
  // output: { sourcemap: true },
});

config = require('./rollup.custom.mjs').default(config, options);

module.exports = config;
