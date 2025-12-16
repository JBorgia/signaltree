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
