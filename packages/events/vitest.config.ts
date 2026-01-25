import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: '../../coverage/packages/events',
    },
  },
  resolve: {
    alias: {
      '@signaltree/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
