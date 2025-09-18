// Usage:
// PROBE=1       -> list discovered libraries/scenarios and exit
// LIBRARY="Foo" -> run only the library matching "Foo" (case-insensitive fuzzy match)
// DEMO_URL=http://localhost:4200/ -> override demo URL
// Example: LIBRARY="SignalTree" node scripts/playwright/run-benchmark-export-all.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function clickCardByText(page, selector, label) {
  const wanted = normalizeText(label);
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    try {
      const item = locator.nth(i);
      await item.waitFor({ state: 'visible', timeout: 5000 });
      const txt = normalizeText(await item.innerText());
      if (txt.includes(wanted) || wanted.includes(txt)) {
        await clickWithRetry(item, 3);
        console.log(`Clicked card ${label}`);
        return true;
      }
    } catch (e) {
      console.warn('Error reading card text', e && e.message);
    }
  }
  console.warn('Card not found for', label);
  return false;
}

async function clickWithRetry(
  locatorOrElement,
  attempts = 3,
  clickOptions = { timeout: 5000 }
) {
  for (let i = 0; i < attempts; i++) {
    try {
      // First try the normal Playwright click (works for Locator & ElementHandle)
      await locatorOrElement.click(clickOptions);
      return;
    } catch (err) {
      // If Playwright's click fails (element not stable / obscured), try a direct DOM click as a fallback.
      console.warn(
        'Click attempt failed, will retry with DOM fallback',
        err && err.message
      );
      try {
        // scroll into view and do a DOM click to bypass Playwright stability checks
        await locatorOrElement.scrollIntoViewIfNeeded?.();
        await locatorOrElement.evaluate((el) => el && el.click && el.click());
        return;
      } catch (domErr) {
        console.warn('DOM fallback click failed', domErr && domErr.message);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error('Failed to click after retries');
}

function safeFileName(s) {
  return s.replace(/[^a-z0-9._-]/gi, '_');
}

(async () => {
  const url = process.env.DEMO_URL || 'http://localhost:4200/';
  const artifactsDir = path.resolve(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir))
    fs.mkdirSync(artifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Opening demo at', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  // capture page console logs so we can write them to diagnostics on failure
  const pageLogs = [];
  page.on('console', (msg) => {
    const txt = msg.text();
    pageLogs.push(txt);
    console.log('PAGE LOG:', txt);
  });

  // Navigate to realistic comparison
  try {
    await page.click('a[href="/realistic-comparison"]', { timeout: 5000 });
  } catch {
    await page.goto(new URL('/realistic-comparison', url).toString(), {
      waitUntil: 'networkidle',
    });
  }

  // wait for UI
  try {
    await page.waitForSelector('.benchmark-container', { timeout: 30000 });
  } catch {
    console.warn('benchmark container not found quickly, continuing');
  }

  // attempt calibration similar to the single-run script
  try {
    const calibrateBtn = await page.$(
      'button:has-text("Calibrate Environment")'
    );
    if (calibrateBtn) {
      await page.bringToFront();
      await page.mouse.move(100, 100);
      await calibrateBtn.click();
      try {
        await page.waitForFunction(
          () => {
            const el = document.querySelector('.reliability-indicator');
            return el && el.getAttribute('data-score') !== '0';
          },
          { timeout: 60000 }
        );
      } catch {
        // ignore
      }
    }
  } catch (e) {
    console.warn('Calibration attempt failed', e && e.message);
  }

  // discover libraries from the DOM (library cards)
  const libraryEls = await page.$$('.library-card');
  const libraries = [];
  for (const el of libraryEls) {
    try {
      const txt = (await el.innerText()).trim().split('\n')[0];
      if (txt) libraries.push(txt);
    } catch (e) {
      console.warn('Error reading library card', e && e.message);
    }
  }
  const requestedLib = process.env.LIBRARY || process.env.LIB || null;
  const probeMode = !!process.env.PROBE;
  if (probeMode)
    console.log(
      'Probe mode enabled: will only list libraries/scenarios and exit'
    );
  if (requestedLib) console.log('Requested single library run:', requestedLib);
  // fallback if discovery failed: use common labels
  if (libraries.length === 0) libraries.push('SignalTree', 'NgRx Store');

  // discover available scenarios
  const scenarioEls = await page.$$('.benchmark-card');
  const scenarios = [];
  for (const el of scenarioEls) {
    try {
      const txt = (await el.innerText()).trim().split('\n')[0];
      if (txt) scenarios.push(txt);
    } catch (e) {
      console.warn('Error reading scenario card', e && e.message);
    }
  }
  // fallback to common middleware scenarios if none found
  if (scenarios.length === 0)
    scenarios.push(
      'Single Middleware',
      'Multiple Middleware',
      'Conditional Middleware'
    );

  console.log('Found libraries:', libraries);
  console.log('Found scenarios:', scenarios);

  // If probe mode was requested, print and exit early
  if (probeMode) {
    await browser.close();
    process.exit(0);
  }

  // Iterate libraries and run per-library exports (or a single requested library)
  for (const lib of libraries) {
    if (requestedLib) {
      const want = normalizeText(requestedLib);
      if (
        !normalizeText(lib).includes(want) &&
        !want.includes(normalizeText(lib))
      ) {
        // skip libraries that don't match the request
        continue;
      }
    }
    // Prefer deterministic clear-selection control if present, otherwise
    // fall back to clicking library cards to reset selection.
    const clearSelector = '.clear-selection';
    try {
      const clearLoc = page.locator(clearSelector);
      if ((await clearLoc.count()) > 0) {
        await clickWithRetry(clearLoc.first(), 2);
      } else {
        const allLibCards = page.locator('.library-card');
        const n = await allLibCards.count();
        for (let i = 0; i < n; i++) {
          try {
            await clickWithRetry(allLibCards.nth(i), 1);
          } catch (e) {
            // ignore individual failures
          }
        }
      }
    } catch (e) {
      console.warn('Library reset attempt failed', e && e.message);
    }

    const okLib = await clickCardByText(page, '.library-card', lib);
    if (!okLib) {
      console.warn('Skipping library due to selection failure:', lib);
      continue;
    }

    // Try to select the "All Tests" preset for this library first.
    // This preset selects only supported scenarios for the currently selected library.
    let presetClicked = false;
    try {
      const presetLoc = page.locator('.preset-card');
      const pc = await presetLoc.count();
      for (let i = 0; i < pc; i++) {
        const p = presetLoc.nth(i);
        try {
          await p.waitFor({ state: 'visible', timeout: 3000 });
          const txt = (await p.innerText()).trim().split('\n')[0];
          if (txt === 'All Tests' || txt === 'All tests') {
            await clickWithRetry(p, 3);
            presetClicked = true;
            console.log('Clicked All Tests preset for', lib);
            break;
          }
        } catch (e) {
          console.warn('Error reading preset card text', e && e.message);
        }
      }
    } catch (_e) {
      console.warn('Error finding preset cards', _e && _e.message);
    }

    // Fallback: if no preset found, select all scenario cards manually
    if (!presetClicked) {
      try {
        const allScCards = await page.$$('.benchmark-card');
        for (const c of allScCards) {
          try {
            await c.click();
          } catch (e) {
            console.warn('Error clicking scenario card', e && e.message);
          }
        }
        console.log('Fallback: selected all scenario cards for', lib);
      } catch (e) {
        console.warn(
          'Error finding scenario cards for fallback',
          e && e.message
        );
      }
    }

    // click Run (prefer data-test-id, fall back to labeled and btn-run variants)
    try {
      const runBtnPreferred = page.locator('[data-test-id="run-benchmarks"]');
      if ((await runBtnPreferred.count()) > 0) {
        await clickWithRetry(runBtnPreferred.first(), 2);
      } else {
        const runBtn = page.locator('button:has-text("Run Benchmarks")');
        if ((await runBtn.count()) > 0) {
          await clickWithRetry(runBtn.first(), 2);
        }
      }
      try {
        const runEnabled = page.locator('button.btn-run:not([disabled])');
        await runEnabled.waitFor({ timeout: 120000 });
        await clickWithRetry(runEnabled.first(), 3);
      } catch (err) {
        console.warn(
          'Timed out waiting for enabled run button',
          err && err.message
        );
      }

      console.log(`Running benchmarks for ${lib} ...`);
      // prefer stable data-test-id selector for export button, fallback to text/button class
      try {
        await page.waitForSelector('[data-test-id="export-json"]', {
          timeout: 600000,
        });
      } catch {
        await page.waitForSelector('button:has-text("Export JSON")', {
          timeout: 600000,
        });
      }

      // Wait for any progress overlays/modals to disappear before exporting (long-running benchmarks)
      try {
        // prefer modal data-test-id if present
        const modalSelector = '[data-test-id="progress-modal"]';
        if ((await page.$(modalSelector)) !== null) {
          await page.waitForSelector(modalSelector, {
            state: 'hidden',
            timeout: 300000,
          });
        } else {
          await page.waitForSelector('.progress-modal', {
            state: 'hidden',
            timeout: 300000,
          });
        }
      } catch {
        // ignore: overlay may not appear or may not hide in time; proceed and attempt export
      }

      // Try clicking Export JSON with retries and wait longer for the download event
      let download = null;
      const maxExportAttempts = 3;
      for (let attempt = 1; attempt <= maxExportAttempts; attempt++) {
        try {
          const exportSelectorPreferred = '[data-test-id="export-json"]';
          const exportSelector = 'button:has-text("Export JSON")';
          let exportBtn = page.locator(exportSelectorPreferred);
          if ((await exportBtn.count()) === 0)
            exportBtn = page.locator(exportSelector);

          // wait for the button to be visible (long-running benchmarks may take a while)
          if ((await exportBtn.count()) > 0) {
            await exportBtn
              .first()
              .waitFor({ state: 'visible', timeout: 120000 });
            await exportBtn.first().scrollIntoViewIfNeeded();
          }

          // wait for download event on the page with a longer timeout (5 minutes)
          const dlPromise = page.waitForEvent('download', { timeout: 300000 });

          if ((await exportBtn.count()) > 0) {
            // try a slightly more patient click and allow DOM fallback inside helper
            await clickWithRetry(exportBtn.first(), 5, { timeout: 10000 });
          } else {
            const fallback = page.locator('button.btn-export');
            if ((await fallback.count()) > 0) {
              await fallback
                .first()
                .waitFor({ state: 'visible', timeout: 120000 });
              await fallback.first().scrollIntoViewIfNeeded();
              await clickWithRetry(fallback.first(), 5, { timeout: 10000 });
            } else throw new Error('No export button found');
          }

          download = await dlPromise;
          break;
        } catch (err) {
          console.warn(
            `Export attempt ${attempt} failed for ${lib}:`,
            err && err.message
          );
          try {
            // save an intermediate screenshot to help triage flaky export UI
            const sPath = path.join(
              artifactsDir,
              `export_fail_${safeFileName(lib)}_${attempt}.png`
            );
            try {
              await page.screenshot({
                path: sPath,
                fullPage: false,
                timeout: 15000,
              });
              console.warn('Wrote export attempt screenshot to', sPath);
            } catch (sErr) {
              console.warn('Screenshot attempt failed', sErr && sErr.message);
            }
          } catch (sErr) {
            console.warn(
              'Failed to write export attempt screenshot',
              sErr && sErr.message
            );
          }
          if (attempt < maxExportAttempts) await page.waitForTimeout(2000);
        }
      }
      if (!download) throw new Error('Export download did not start');

      const tmpPath = await download.path();
      const outName = safeFileName(`${lib}-results.json`);
      const outPath = path.join(artifactsDir, outName);
      if (tmpPath) {
        fs.copyFileSync(tmpPath, outPath);
      } else {
        const content = await download.text();
        fs.writeFileSync(outPath, content, 'utf8');
      }
      console.log('Wrote export for', lib, '->', outPath);
      // small pause between runs
      await page.waitForTimeout(1000);
    } catch (e) {
      console.error('Error running benchmarks for', lib, e && e.message);
      try {
        const html = await page.content();
        const baseName = `error_${safeFileName(lib)}`;
        fs.writeFileSync(
          path.join(artifactsDir, `${baseName}.html`),
          html,
          'utf8'
        );
        try {
          await page.screenshot({
            path: path.join(artifactsDir, `${baseName}.png`),
            fullPage: true,
          });
        } catch (sErr) {
          console.warn('Screenshot failed for', lib, sErr && sErr.message);
        }
        try {
          fs.writeFileSync(
            path.join(artifactsDir, `${baseName}.log`),
            pageLogs.join('\n'),
            'utf8'
          );
        } catch (lErr) {
          console.warn(
            'Failed to write console log for',
            lib,
            lErr && lErr.message
          );
        }
      } catch (ee) {
        console.warn('Failed to save error HTML for', lib, ee && ee.message);
      }
    }
  }

  // If a single library was requested but nothing matched, print available libraries and exit non-zero
  if (requestedLib) {
    const matched = libraries.some(
      (l) =>
        normalizeText(l).includes(normalizeText(requestedLib)) ||
        normalizeText(requestedLib).includes(normalizeText(l))
    );
    if (!matched) {
      console.error('Requested library not found:', requestedLib);
      console.error('Available libraries were:', libraries.join(', '));
      await browser.close();
      process.exit(2);
    }
  }

  await browser.close();
  console.log('All runs complete');
})();
