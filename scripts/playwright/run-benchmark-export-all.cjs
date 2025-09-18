// Playwright-based exporter for demo app.
// Supports MEMO_MODES (comma separated) or MEMO_MODE (single) env var to iterate memoization modes.
// Optional environment variables:
//   DEMO_URL - demo base URL (default http://localhost:4200)
//   LIBRARY  - run only libraries that fuzzy-match this string
//   PROBE=1  - list discovered libraries and scenarios, then exit

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function safeFileName(s) {
  return (s || '').replace(/[^a-z0-9._-]/gi, '_');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickWithRetry(
  target,
  attempts = 3,
  clickOptions = { timeout: 5000 }
) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (target && typeof target.click === 'function') {
        await target.click(clickOptions);
        return;
      }
    } catch (err) {
      try {
        if (target && typeof target.evaluate === 'function') {
          await target.evaluate(
            (el) =>
              el &&
              el.scrollIntoView &&
              el.scrollIntoView({ block: 'center', inline: 'center' })
          );
          await target.evaluate((el) => el && el.click && el.click());
          return;
        }
      } catch (innerErr) {
        try {
          console.debug &&
            console.debug(
              'clickWithRetry inner error',
              innerErr && innerErr.message
            );
        } catch (e) {}
      }
      await sleep(300);
    }
  }
  throw new Error('Failed to click after retries');
}

async function clickCardByText(page, selector, label) {
  const wanted = normalizeText(label);
  try {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      try {
        await item.waitFor({ state: 'visible', timeout: 1500 });
        const raw = await item.innerText();
        const txt = normalizeText(raw);
        if (txt.includes(wanted) || wanted.includes(txt)) {
          await clickWithRetry(item, 3);
          return true;
        }
      } catch (err) {
        try {
          console.debug('clickCardByText inner error', err && err.message);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    try {
      console.debug('clickCardByText outer error', err && err.message);
    } catch {
      /* ignore */
    }
  }

  try {
    const did = await page.evaluate(
      (sel, libText) => {
        const items = Array.from(document.querySelectorAll(sel));
        const want = (libText || '').trim().toLowerCase();
        for (const it of items) {
          const txt = (it.innerText || '').trim().split('\n')[0] || '';
          const n = txt.toLowerCase();
          if (n.includes(want) || want.includes(n)) {
            try {
              it.click();
              return true;
            } catch (e) {
              try {
                it.dispatchEvent(new Event('click', { bubbles: true }));
                return true;
              } catch (e2) {}
            }
          }
        }
        return false;
      },
      selector,
      label
    );
    return !!did;
  } catch (e) {
    return false;
  }
}

async function run() {
  const urlBase = process.env.DEMO_URL || 'http://localhost:4200/';
  const memoModesEnv = process.env.MEMO_MODES || process.env.MEMO_MODE || '';
  const memoModes = memoModesEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const modes = memoModes.length > 0 ? memoModes : [''];

  const artifactsDir = path.resolve(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir))
    fs.mkdirSync(artifactsDir, { recursive: true });

  // Per-library timeout (ms). If a single library stalls, capture state and continue.
  const perLibTimeout = parseInt(process.env.LIB_TIMEOUT_MS || '600000', 10);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on('console', (msg) => {
    try {
      console.log('PAGE LOG:', msg.text());
    } catch (e) {}
  });

  for (const currentMemoMode of modes) {
    const modeLabel = currentMemoMode || 'none';
    try {
      const urlObj = new URL(urlBase);
      if (currentMemoMode) urlObj.searchParams.set('memo', currentMemoMode);
      else urlObj.searchParams.delete('memo');

      console.log('Starting run for memo mode:', modeLabel);
      await page.goto(urlObj.toString(), { waitUntil: 'networkidle' });

      if (currentMemoMode) {
        try {
          await page.evaluate((m) => {
            window.__SIGNALTREE_MEMO_MODE = m;
          }, currentMemoMode);
        } catch (e) {}
      }

      try {
        await page.click('a[href="/realistic-comparison"]', { timeout: 3000 });
      } catch (e) {
        await page.goto(new URL('/realistic-comparison', urlObj).toString(), {
          waitUntil: 'networkidle',
        });
      }
      try {
        await page.waitForSelector('.benchmark-container', { timeout: 30000 });
      } catch (e) {}

      try {
        const calibrateBtn = await page.$(
          'button:has-text("Calibrate Environment")'
        );
        if (calibrateBtn) {
          await clickWithRetry(calibrateBtn, 2);
          try {
            await page.waitForFunction(
              () => {
                const el = document.querySelector('.reliability-indicator');
                return el && el.getAttribute('data-score') !== '0';
              },
              { timeout: 60000 }
            );
          } catch (e) {}
        }
      } catch (e) {}

      const libraries = [];
      try {
        const libraryEls = await page.$$('.library-card');
        for (const el of libraryEls) {
          try {
            const txt = (await el.innerText()).trim().split('\n')[0];
            if (txt) libraries.push(txt);
          } catch (e) {}
        }
      } catch (e) {}
      if (libraries.length === 0) libraries.push('SignalTree', 'NgRx Store');

      const scenarios = [];
      try {
        const scenarioEls = await page.$$('.benchmark-card');
        for (const el of scenarioEls) {
          try {
            const txt = (await el.innerText()).trim().split('\n')[0];
            if (txt) scenarios.push(txt);
          } catch (e) {}
        }
      } catch (e) {}
      if (scenarios.length === 0)
        scenarios.push('Single Middleware', 'Multiple Middleware');

      console.log('Discovered libraries:', libraries.join(', '));
      console.log('Discovered scenarios:', scenarios.join(', '));

      const requestedLib = process.env.LIBRARY || process.env.LIB || null;
      const probeMode = !!process.env.PROBE;
      if (probeMode) {
        console.log(
          'Probe mode: listing libraries and scenarios then exiting for this memo mode'
        );
        for (const lib of libraries) console.log('Library:', lib);
        for (const sc of scenarios) console.log('Scenario:', sc);
        continue;
      }

      for (const lib of libraries) {
        if (
          requestedLib &&
          !normalizeText(lib).includes(normalizeText(requestedLib))
        )
          continue;
        console.log('Processing library:', lib);
        // Run processing with a per-library timeout so a single stuck benchmark
        // doesn't block the entire exporter. The inner worker keeps many of the
        // original try/catch guards so transient UI flakiness is tolerated.
        const worker = (async () => {
          try {
            const clearLoc = page.locator('.clear-selection');
            if ((await clearLoc.count()) > 0)
              await clickWithRetry(clearLoc.first(), 2);
          } catch (e) {}
          let okLib = false;
          try {
            okLib = await clickCardByText(page, '.library-card', lib);
          } catch (e) {
            okLib = false;
          }
          if (!okLib) {
            try {
              const libraryEls2 = await page.$$('.library-card');
              const idx = libraries.findIndex(
                (l) => normalizeText(l) === normalizeText(lib)
              );
              if (idx >= 0 && libraryEls2[idx]) {
                await clickWithRetry(libraryEls2[idx], 3);
                okLib = true;
              }
            } catch (e) {}
          }
          if (!okLib) console.warn('Failed to select library', lib);

          try {
            const presetLoc = page.locator('.preset-card');
            const pc = await presetLoc.count();
            for (let i = 0; i < pc; i++) {
              const p = presetLoc.nth(i);
              try {
                const txt = (await p.innerText()).trim().split('\n')[0];
                if (txt === 'All Tests' || txt === 'All tests') {
                  await clickWithRetry(p, 3);
                  break;
                }
              } catch (e) {}
            }
          } catch (e) {}

          try {
            const allScCards = await page.$$('.benchmark-card');
            for (const c of allScCards) {
              try {
                await clickWithRetry(c, 2);
              } catch (e) {}
            }
          } catch (e) {}

          try {
            await sleep(600);
            const selectedScenarios = await page.evaluate(
              () => document.querySelectorAll('.benchmark-card.selected').length
            );
            if (!selectedScenarios) {
              const first = await page.$('.benchmark-card');
              if (first) await clickWithRetry(first, 3);
            }
          } catch (e) {}

          try {
            const runBtnPreferred = page.locator(
              '[data-test-id="run-benchmarks"]'
            );
            if ((await runBtnPreferred.count()) > 0)
              await clickWithRetry(runBtnPreferred.first(), 2);
            else {
              const runBtn = page.locator('button:has-text("Run Benchmarks")');
              if ((await runBtn.count()) > 0)
                await clickWithRetry(runBtn.first(), 2);
            }

            try {
              const runEnabled = page.locator('button.btn-run:not([disabled])');
              await runEnabled.waitFor({ timeout: 120000 });
              await clickWithRetry(runEnabled.first(), 3);
            } catch (e) {}

            try {
              await page.waitForSelector('[data-test-id="export-json"]', {
                timeout: 600000,
              });
            } catch (e) {
              try {
                await page.waitForSelector('button:has-text("Export JSON")', {
                  timeout: 600000,
                });
              } catch (e2) {}
            }

            try {
              const modalSelector = '[data-test-id="progress-modal"]';
              if ((await page.$(modalSelector)) !== null)
                await page.waitForSelector(modalSelector, {
                  state: 'hidden',
                  timeout: 300000,
                });
              else
                await page.waitForSelector('.progress-modal', {
                  state: 'hidden',
                  timeout: 300000,
                });
            } catch (e) {}

            let download = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                let exportBtn = page.locator('[data-test-id="export-json"]');
                if ((await exportBtn.count()) === 0)
                  exportBtn = page.locator('button:has-text("Export JSON")');
                if ((await exportBtn.count()) > 0) {
                  await exportBtn
                    .first()
                    .waitFor({ state: 'visible', timeout: 120000 });
                  await exportBtn.first().scrollIntoViewIfNeeded();
                  await clickWithRetry(exportBtn.first(), 5, {
                    timeout: 10000,
                  });
                } else {
                  const fallback = page.locator('button.btn-export');
                  if ((await fallback.count()) > 0) {
                    await fallback
                      .first()
                      .waitFor({ state: 'visible', timeout: 120000 });
                    await clickWithRetry(fallback.first(), 5, {
                      timeout: 10000,
                    });
                  } else throw new Error('No export button found');
                }
                download = await page.waitForEvent('download', {
                  timeout: 300000,
                });
                break;
              } catch (err) {
                try {
                  await page.screenshot({
                    path: path.join(
                      artifactsDir,
                      `export_fail_${safeFileName(lib)}_${attempt}.png`
                    ),
                    timeout: 15000,
                  });
                } catch (e) {}
                if (attempt < 3) await sleep(2000);
              }
            }
            if (!download) throw new Error('Export download did not start');

            const tmpPath = await download.path();
            const modeSuffix =
              currentMemoMode && currentMemoMode.length
                ? `-${safeFileName(currentMemoMode)}`
                : '';
            const outName = safeFileName(`${lib}${modeSuffix}-results.json`);
            const outPath = path.join(artifactsDir, outName);
            if (tmpPath) fs.copyFileSync(tmpPath, outPath);
            else fs.writeFileSync(outPath, await download.text(), 'utf8');
          } catch (e) {
            throw e; // allow outer race to handle captures
          }
        })();

        try {
          await Promise.race([
            worker,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('LibraryTimeout')),
                perLibTimeout
              )
            ),
          ]);
        } catch (err) {
          console.warn(
            'Library processing failed or timed out',
            lib,
            err && err.message
          );
          try {
            const baseName = `error_${safeFileName(lib)}${
              currentMemoMode ? `-${safeFileName(currentMemoMode)}` : ''
            }`;
            try {
              const html = await page.content();
              fs.writeFileSync(
                path.join(artifactsDir, `${baseName}.html`),
                html,
                'utf8'
              );
            } catch (e) {}
            try {
              await page.screenshot({
                path: path.join(artifactsDir, `${baseName}.png`),
                fullPage: true,
              });
            } catch (e) {}
            try {
              fs.writeFileSync(
                path.join(artifactsDir, `${baseName}.log`),
                `memoMode:${modeLabel}\nerror:${(err && err.stack) || err}\n`,
                'utf8'
              );
            } catch (e) {}
          } catch (err2) {}
        }
      }
    } catch (err) {
      console.warn('Run failed for memo mode', modeLabel, err && err.message);
    }
  }

  await browser.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Export script failed', (err && err.stack) || err);
    process.exit(2);
  });
