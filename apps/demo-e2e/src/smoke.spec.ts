import { test } from '@playwright/test';
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
    waitUntil: 'networkidle',
  });

  // Ensure artifacts dir exists
  const artifactsDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(artifactsDir))
    fs.mkdirSync(artifactsDir, { recursive: true });

  // Make sure the enterprise enhancer checkbox is unchecked for a fair baseline run
  try {
    const enterprise = await page.$('#include-enterprise');
    if (enterprise) {
      const checked = await enterprise.isChecked();
      if (checked) await enterprise.click();
    }
  } catch (e) {
    // ignore if element not present
  }

  // Clear any previous globals
  await page.evaluate(() => {
    try {
      (window as any).__LAST_BENCHMARK_EXTENDED_RESULTS__ = undefined;
    } catch (e) {}
    try {
      (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ = undefined;
    } catch (e) {}
  });

  // Click the Run Benchmarks button
  await page.click('[data-test-id="run-benchmarks"]');

  // Wait for results section to appear (indicates completion)
  await page.waitForSelector('.results-section', { timeout: 120000 });

  // Read persisted globals
  const payload = await page.evaluate(() => {
    return {
      extended: (window as any).__LAST_BENCHMARK_EXTENDED_RESULTS__ || null,
      activeEnhancers: (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ || null,
    };
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('Wrote extended results to', OUT_PATH);
});
