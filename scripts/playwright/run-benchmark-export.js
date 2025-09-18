const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const url = process.env.DEMO_URL || 'http://localhost:4201/';
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

  try {
    const link = await page.$(`text=Realistic Comparison`);
    if (link) {
      await link.click();
      await page.waitForLoadState('networkidle');
    }
  } catch {
    console.warn('Could not click Realistic Comparison link, continuing');
  }

  const ensureChecked = async (label) => {
    const el = await page.$(`label:has-text("${label}") input[type=checkbox]`);
    if (el) {
      const checked = await el.isChecked();
      if (!checked) await el.check();
    }
  };

  await ensureChecked('SignalTree');
  await ensureChecked('NgRx Store');

  const selectScenario = async (name) => {
    const el = await page.$(`label:has-text("${name}") input[type=checkbox]`);
    if (el) {
      const checked = await el.isChecked();
      if (!checked) await el.check();
    }
  };

  await selectScenario('Single Middleware');
  await selectScenario('Multiple Middleware');
  await selectScenario('Conditional Middleware');

  const runBtn = await page.$(`text=Run Benchmarks`);
  if (runBtn) {
    await runBtn.click();
  } else {
    const alt = await page.$(`button:has-text("Run")`);
    if (alt) await alt.click();
  }

  console.log('Waiting for benchmarks to complete...');
  await page.waitForSelector('button:has-text("Export JSON")', {
    timeout: 180000,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export JSON")'),
  ]);

  const tmpPath = await download.path();
  if (tmpPath) {
    fs.copyFileSync(tmpPath, outPath);
    console.log('Saved export to', outPath);
  } else {
    const content = await download.text();
    fs.writeFileSync(outPath, content);
    console.log('Saved export to', outPath);
  }

  await browser.close();
})();
