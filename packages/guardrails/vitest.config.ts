import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', 'tests/**/*.spec.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/__tests__/**', '**/index.ts', '**/noop.ts'],
      reportsDirectory: '../../../coverage/packages/guardrails',
    },
  },
  resolve: {
    alias: {
      '@signaltree/core': resolve(__dirname, '../core/src'),
    },
  },
  define: {
    __DEV__: true,
    'globalThis.ngDevMode': true,
  },
  esbuild: {
    tsconfigRaw: '{}',
  },
});
