import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

(async () => {
  const url = process.env.DEMO_URL || 'http://localhost:4200/';
  const outPath = path.resolve(
    process.cwd(),
    'artifacts',
    'benchmark-results-automated.json'
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Opening demo at', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Navigate to Realistic Comparison page
  // Try to click a link with text 'Realistic Comparison' or navigate directly
  try {
    const link = await page.$(`text=Realistic Comparison`);
    if (link) {
      await link.click();
      await page.waitForLoadState('networkidle');
    }
  } catch {
    console.warn('Could not click Realistic Comparison link, continuing');
  }

  // Ensure baseline and NgRx are selected - checkboxes by label
  const ensureChecked = async (label: string) => {
    const el = await page.$(`label:has-text("${label}") input[type=checkbox]`);
    if (el) {
      const checked = await el.isChecked();
      if (!checked) await el.check();
    }
  };

  await ensureChecked('SignalTree');
  await ensureChecked('NgRx Store');

  // Select middleware scenarios: single, multiple, conditional
  const selectScenario = async (name: string) => {
    const el = await page.$(`label:has-text("${name}") input[type=checkbox]`);
    if (el) {
      const checked = await el.isChecked();
      if (!checked) await el.check();
    }
  };

  await selectScenario('Single Middleware');
  await selectScenario('Multiple Middleware');
  await selectScenario('Conditional Middleware');

  // Click Run Benchmarks button (button text 'Run' or 'Run Benchmarks')
  const runBtn = await page.$(`text=Run Benchmarks`);
  if (runBtn) {
    await runBtn.click();
  } else {
    const alt = await page.$(`button:has-text("Run")`);
    if (alt) await alt.click();
  }

  // Wait for completion: detect Export JSON button enabled
  console.log('Waiting for benchmarks to complete...');
  await page.waitForSelector('button:has-text("Export JSON")', {
    timeout: 120000,
  });

  // Click Export JSON and capture download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export JSON")'),
  ]);

  const tmpPath = await download.path();
  if (tmpPath) {
    fs.copyFileSync(tmpPath, outPath);
    console.log('Saved export to', outPath);
  } else {
    await download.saveAs(outPath);
    console.log('Saved export to', outPath);
  }

  await browser.close();
})();
