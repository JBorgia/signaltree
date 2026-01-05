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

  // Calibrate environment if needed, then set quick test settings and click Run Benchmarks
  const calibrateBtn = page.locator('.btn-calibrate');
  const calibrateCount = await calibrateBtn.count();
  if (calibrateCount > 0) {
    await calibrateBtn.first().click();
    await page.waitForSelector('.calibration-results', { timeout: 30000 });
  }

  // Use small dataset / iterations so test finishes quickly
  await page.selectOption('#data-size', '1000');
  await page.fill('#iterations', '10');
  await page.fill('#warmup', '5');

  // Select an additional library and a scenario so benchmarks can run
  const ngrxCheckbox = page.getByTestId('lib-ngrx-store-checkbox');
  if ((await ngrxCheckbox.count()) > 0) {
    await ngrxCheckbox.first().check();
  }

  // Select the first benchmark scenario
  const firstScenario = page
    .locator('.benchmarks-grid .benchmark-card')
    .first();
  await firstScenario.click();

  // Wait for Run Benchmarks to become enabled and click it
  const runBtn = page.getByTestId('run-benchmarks');
  await expect(runBtn).toBeEnabled({ timeout: 30000 });
  await runBtn.click();

  // Wait for the run to start (progress modal), then cancel to avoid long-running work in CI
  await page.waitForSelector('[data-test-id="progress-modal"]', { timeout: 30000 });
  // Click cancel to stop the benchmark safely
  if ((await page.locator('[data-test-id="progress-cancel"]').count()) > 0) {
    await page.click('[data-test-id="progress-cancel"]');
    await page.waitForSelector('[data-test-id="progress-modal"]', { state: 'detached', timeout: 10000 });
  }

  // Read persisted globals (may be set even if we canceled)
  const payload = await page.evaluate(() => {
    return {
      extended: (window as any).__LAST_BENCHMARK_EXTENDED_RESULTS__ || null,
      activeEnhancers: (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ || null,
      started: (window as any).__LAST_BENCHMARK_RESULTS_TS__ || null,
    };
  });

  // At minimum, ensure the run was initiated (timestamp set) or extended results exist
  expect(payload.started || payload.extended).toBeTruthy();

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('Wrote extended results (or start marker) to', OUT_PATH);
});
