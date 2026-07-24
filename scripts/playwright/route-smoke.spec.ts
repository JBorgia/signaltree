/**
 * Demo route smoke test (v12 audit intake, 2026-07-24).
 *
 * Visits the key demo routes against a static build and asserts:
 *   1. the route renders a visible <h1> or <main> (the SPA actually booted
 *      and the lazy route chunk resolved), and
 *   2. no console errors / uncaught page errors fired.
 *
 * Routes mirror apps/demo/src/app/app.routes.ts — update BOTH when a
 * route in this list is renamed.
 */
import { expect, test } from '@playwright/test';

const ROUTES = [
  '/', // home
  '/entity-collection', // entityMap cache-aware loading showcase
  '/signal-forms', // Angular Signal Forms interop
  '/async', // asyncSource & asyncQuery markers
  '/marker-zoo', // all 6 markers at 4 depths
  '/benchmarks', // live cross-library benchmarks
  '/migrate', // NgRx migration recipe
  '/docs', // package documentation
];

// Noise that is not a product bug and would make the gate flaky.
const IGNORED_ERROR_PATTERNS = [/favicon/i];

for (const route of ROUTES) {
  test(`route ${route} renders with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        !IGNORED_ERROR_PATTERNS.some((re) => re.test(msg.text()))
      ) {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    const response = await page.goto(route, { waitUntil: 'load' });
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(
      response?.status(),
      `HTTP status for ${route}`
    ).toBeLessThan(400);

    // The SPA booted and the lazy route chunk rendered something real.
    await expect(
      page.locator('h1, main').first(),
      `no visible h1/main on ${route}`
    ).toBeVisible({ timeout: 20_000 });

    // Give async boot errors (guardrails init, lazy chunks) a beat to surface.
    await page.waitForTimeout(500);

    expect(
      errors,
      `console/page errors on ${route}:\n${errors.join('\n')}`
    ).toEqual([]);
  });
}
