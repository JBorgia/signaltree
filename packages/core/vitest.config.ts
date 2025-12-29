import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
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
