import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // Initializes the Angular TestBed environment for specs that use
    // TestBed/inject (asyncSource, asyncQuery markers). Without it those
    // specs fail with "Cannot read properties of null (reading 'ngModule')".
    setupFiles: ['src/test-setup.ts'],
    include: [
      '**/*.spec.ts',
      'tests/**/*.spec.ts',
      'src/**/*.spec.ts',
      'src/**/lib/**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/typing/**',
      '**/*.generated.spec.ts',
      '**/all-chains.spec.ts',
      '**/all-subsets.spec.ts',
      // Exclude type-only spec files generated for typing checks
      '**/*/typing.spec.ts',
      '**/lib/typing.spec.ts',
      '**/*typing-chain.spec.ts',
      '**/*typing*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/__tests__/**', '**/index.ts', '**/noop.ts'],
    },
  },
  define: {
    __DEV__: true,
  },
  esbuild: {
    tsconfigRaw: '{}',
  },
});
