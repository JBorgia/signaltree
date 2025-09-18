const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const url = process.env.DEMO_URL || 'http://localhost:4200/';
  const outPath = path.resolve(
    process.cwd(),
    'artifacts',
    'benchmark-results-automated.json'
  );

  // Run headful with a small slowMo so interactions are more human-like.
  // Headful runs tend to allow timers/animations that are suppressed in pure
  // headless mode and helps the demo's calibration logic to complete.
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Opening demo at', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Forward page console messages to node console for debugging
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  // Navigate to the realistic comparison page which contains the benchmark UI.
  try {
    // Try clicking the nav link, fallback to direct navigation
    try {
      await page.click('a[href="/realistic-comparison"]', { timeout: 5000 });
      console.log('Clicked Realistic Comparison nav link');
    } catch (e) {
      console.log(
        'Nav link click failed; navigating directly to /realistic-comparison'
      );
      await page.goto(new URL('/realistic-comparison', url).toString(), {
        waitUntil: 'networkidle',
      });
    }

    await page.waitForSelector('.benchmark-container', { timeout: 30000 });
    console.log('Found benchmark container');
  } catch (e) {
    console.warn('Benchmark container did not appear quickly; continuing');
  }

  // Click calibrate and wait for environment calibration to complete (click the button so Angular handlers run)
  try {
    // Try to kick the demo's calibration logic with realistic interactions.
    const reliabilityEl = await page.$('.reliability-indicator');
    const beforeScore = reliabilityEl
      ? await reliabilityEl.getAttribute('data-score')
      : null;
    console.log('Calibration score before:', beforeScore);

    const calibrateBtn = await page.$(
      'button:has-text("Calibrate Environment")'
    );
    if (calibrateBtn) {
      console.log('Clicking Calibrate Environment (initial)');
      // bring page to front and do a friendly mouse move so the app receives
      // user-like input events which sometimes affect scheduling in browsers.
      await page.bringToFront();
      await page.mouse.move(100, 100);
      await calibrateBtn.click();

      // Wait for calibration score to change. If it doesn't, retry a few times
      // with small pauses and additional clicks to simulate a human.
      let calibrated = false;
      try {
        await page.waitForFunction(
          () => {
            const el = document.querySelector('.reliability-indicator');
            return el && el.getAttribute('data-score') !== '0';
          },
          { timeout: 90000 }
        );
        calibrated = true;
      } catch (e) {
        // fallthrough to retry loop
      }

      if (!calibrated) {
        console.log(
          'Calibration did not complete immediately; retrying interactions'
        );
        for (let i = 0; i < 6 && !calibrated; i++) {
          try {
            await page.mouse.move(200 + i * 5, 150 + i * 3);
            await calibrateBtn.click();
            // give the demo some breathing room
            await page.waitForTimeout(2500);
            calibrated = await page.evaluate(() => {
              const el = document.querySelector('.reliability-indicator');
              return el && el.getAttribute('data-score') !== '0';
            });
            console.log('Retry', i, 'calibrated?', calibrated);
          } catch (e) {
            // ignore and continue retrying
          }
        }
      }

      const afterEl = await page.$('.reliability-indicator');
      const afterScore = afterEl
        ? await afterEl.getAttribute('data-score')
        : null;
      console.log('Calibration complete, score after:', afterScore);
    }
  } catch {
    console.warn('Calibration attempt failed or timed out, continuing');
  }

  // Click the library card to ensure Angular handlers run
  const clickCardByText = async (selector, label) => {
    const cards = await page.$$(selector);
    for (const c of cards) {
      try {
        const txt = (await c.innerText()).trim();
        if (txt.includes(label)) {
          await c.click();
          console.log(`Clicked card ${label}`);
          return true;
        }
      } catch (e) {
        // ignore
      }
    }
    console.warn('Card not found for', label);
    return false;
  };

  // Click libraries and scenarios by visible text so Angular handlers run
  // Choose libraries by their displayed name
  await clickCardByText('.library-card', 'SignalTree');
  await clickCardByText('.library-card', 'NgRx Store');

  // Select scenarios by exact name from scenario-definitions.ts
  const scenariosToSelect = [
    'Single Middleware',
    'Multiple Middleware',
    'Conditional Middleware',
  ];
  for (const s of scenariosToSelect) {
    const ok = await clickCardByText('.benchmark-card', s);
    if (!ok) console.warn('Failed to click scenario card for', s);
  }

  const runBtn = await page.$(`text=Run Benchmarks`);
  if (runBtn) {
    await runBtn.click();
  } else {
    const alt = await page.$(`button:has-text("Run")`);
    if (alt) await alt.click();
  }

  // Wait until Run button is enabled before clicking (some gating like calibration)
  try {
    await page.waitForSelector('button.btn-run:not([disabled])', {
      timeout: 120000,
    });
    const runEnabled = await page.$('button.btn-run:not([disabled])');
    if (runEnabled) await runEnabled.click();
  } catch (err) {
    console.warn(
      'Run button did not become enabled in time; proceeding anyway'
    );
  }

  console.log('Waiting for benchmarks to complete...');
  try {
    await page.waitForSelector('button:has-text("Export JSON")', {
      timeout: 600000,
    });
  } catch (err) {
    console.error(
      'Timeout waiting for Export JSON button:',
      err && err.message
    );
    // Save debug artifacts
    try {
      const debugDir = path.resolve(process.cwd(), 'artifacts');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      const html = await page.content();
      fs.writeFileSync(
        path.join(debugDir, 'run-error-page.html'),
        html,
        'utf8'
      );
      await page.screenshot({
        path: path.join(debugDir, 'run-error-page.png'),
        fullPage: true,
      });
      console.log('Wrote debug artifacts to artifacts/run-error-page.*');
    } catch (e) {
      console.warn('Failed to write debug artifacts', e && e.message);
    }
    await browser.close();
    process.exit(1);
  }

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
