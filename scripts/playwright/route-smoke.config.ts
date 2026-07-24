/**
 * Playwright config for the demo route-smoke suite.
 *
 * Serves the ALREADY-BUILT demo (dist/apps/demo/browser) via the
 * dependency-free serve-dist.mjs and runs route-smoke.spec.ts against it.
 *
 * Local:  npx nx build demo --configuration=production
 *         npm run smoke:routes
 * CI:     validate.yml → demo-route-smoke job
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'route-smoke.spec.ts',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  // Keep traces/artifacts out of the repo root — an untracked test-results/
  // would fail pre-publish validation's clean-working-dir gate.
  outputDir: '../../test-results/route-smoke',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/playwright/serve-dist.mjs 4173',
    cwd: '../..',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
