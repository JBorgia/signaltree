import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/__tests__/**/*.cjs', 'scripts/__tests__/*.cjs', '**/*.spec.ts'],
    globals: true,
  },
});
