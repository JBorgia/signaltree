import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: '../../coverage/packages/realtime',
    },
  },
  resolve: {
    alias: {
      '@signaltree/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
