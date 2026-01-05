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
  await expect(
    page.getByRole('heading', { name: 'Select Libraries to Compare' })
  ).toBeVisible({ timeout: 15000 });
  // Locate the enterprise library card, then find the checkbox inside it (if present)
  const enterpriseCard = page.getByTestId('lib-signaltree-enterprise-card');
  const enterpriseCardCount = await enterpriseCard.count();
  if (enterpriseCardCount > 0) {
    const enterprise = enterpriseCard.locator(
      'input[data-test-id="lib-signaltree-enterprise-checkbox"]'
    );
    const enterpriseCount = await enterprise.count();
    if (enterpriseCount > 0) {
      await enterprise.uncheck();
    } else {
      console.log('Enterprise checkbox not found inside card; continuing');
    }
  } else {
    console.log('Enterprise card not present; continuing');
  }

  // Clear any previous globals
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win['__LAST_BENCHMARK_EXTENDED_RESULTS__'];
    delete win['__SIGNALTREE_ACTIVE_ENHANCERS__'];
  });

  // Click the Run Benchmarks button (wait for it to be present)
  await page.waitForSelector('[data-test-id="run-benchmarks"]', {
    timeout: 15000,
  });
  const runBenchmarksButton = page.getByTestId('run-benchmarks');
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
