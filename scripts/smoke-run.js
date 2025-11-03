const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

(async () => {
  const OUT_PATH = path.resolve(
    process.cwd(),
    'artifacts',
    'smoke-extended-results.json'
  );
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:4200/realistic-comparison', {
    waitUntil: 'networkidle',
  });

  // Run the environment calibration if present (makes Run Benchmarks enabled)
  try {
    const calBtn = await page.$('button.btn-calibrate');
    if (calBtn) {
      // Click calibrate and wait for results element to appear
      await calBtn.click();
      await page.waitForSelector('.calibration-results', { timeout: 60000 });
    }
  } catch (err) {
    // ignore if calibration isn't present or times out
  }

  // Try to disable enterprise enhancer checkbox for a fair baseline run
  try {
    const enterprise = await page.$('#include-enterprise');
    if (enterprise) {
      const checked = await enterprise.isChecked();
      if (checked) await enterprise.click();
    }
  } catch (e) {
    // ignore
  }

  // Clear previous globals
  await page.evaluate(() => {
    try {
      window.__LAST_BENCHMARK_EXTENDED_RESULTS__ = undefined;
    } catch (e) {}
    try {
      window.__SIGNALTREE_ACTIVE_ENHANCERS__ = undefined;
    } catch (e) {}
  });

  // Ensure there is a selected library and scenario so the Run button becomes enabled
  try {
    // Select the first available library checkbox (skip disabled inputs)
    const libChecks = await page.$$(
      '[data-test-id^="lib-"][data-test-id$="-checkbox"]'
    );
    for (const cb of libChecks) {
      const disabled = await cb.evaluate((el) => el.disabled);
      const checked = await cb.evaluate((el) => el.checked);
      if (!disabled && !checked) {
        await cb.click();
        break;
      }
    }

    // Select the first scenario card that is not marked unsupported
    const scenarios = await page.$$('.benchmark-card');
    for (const c of scenarios) {
      const unsupported = await c.$('.unsupported-badge');
      if (!unsupported) {
        await c.click();
        break;
      }
    }
  } catch (e) {
    // ignore selection errors; we'll still wait for the Run button to enable
  }

  // Wait for Run button to become enabled, then click it
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-test-id="run-benchmarks"]');
      return !!btn && !btn.disabled;
    },
    { timeout: 120000 }
  );

  await page.click('[data-test-id="run-benchmarks"]');

  // Wait for results (increase timeout for slow runs)
  await page.waitForSelector('.results-section', { timeout: 120000 });

  const payload = await page.evaluate(() => ({
    extended: window.__LAST_BENCHMARK_EXTENDED_RESULTS__ || null,
    activeEnhancers: window.__SIGNALTREE_ACTIVE_ENHANCERS__ || null,
  }));

  // Ensure artifacts dir
  const artifactsDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(artifactsDir))
    fs.mkdirSync(artifactsDir, { recursive: true });

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('Wrote extended results to', OUT_PATH);

  await browser.close();
})();
