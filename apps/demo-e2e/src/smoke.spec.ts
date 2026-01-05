import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUT_PATH = path.resolve(
  process.cwd(),
  'artifacts',
  'smoke-extended-results.json'
);

test('smoke: run realistic comparison and capture extended results', async ({
  page,
}) => {
  // Navigate directly to the realistic comparison page
  await page.goto('http://localhost:4200/realistic-comparison', {
    waitUntil: 'domcontentloaded',
  });

  // Ensure artifacts dir exists
  const artifactsDir = path.dirname(OUT_PATH);
  fs.mkdirSync(artifactsDir, { recursive: true });

  // Wait for the library selection section to be visible, then ensure enterprise is unchecked
  await page
    .getByRole('heading', { name: 'Select Libraries to Compare' })
    .toBeVisible({ timeout: 15000 });
  const enterprise = page.getByTestId('lib-signaltree-enterprise-checkbox');
  await expect(enterprise).toHaveCount(1, { timeout: 10000 });
  await enterprise.uncheck();

  // Clear any previous globals
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win['__LAST_BENCHMARK_EXTENDED_RESULTS__'];
    delete win['__SIGNALTREE_ACTIVE_ENHANCERS__'];
  });

  // Click the Run Benchmarks button
  const runBenchmarksButton = page.getByTestId('run-benchmarks');
  await expect(runBenchmarksButton).toBeVisible();
  await runBenchmarksButton.click();

  // Wait for results section to appear (indicates completion)
  const resultsSection = page.locator('.results-section');
  await expect(resultsSection).toBeVisible({ timeout: 120000 });

  // Read persisted globals
  const payload = await page.evaluate(() => {
    return {
      extended: (window as any).__LAST_BENCHMARK_EXTENDED_RESULTS__ || null,
      activeEnhancers: (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ || null,
    };
  });

  expect(payload.extended).not.toBeNull();

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('Wrote extended results to', OUT_PATH);
});
