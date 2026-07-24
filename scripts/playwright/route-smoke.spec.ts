/**
 * Demo route smoke test (v12 audit intake, 2026-07-24).
 *
 * Visits the key demo routes against a static build and asserts:
 *   1. the requested route actually RESOLVED — the final URL pathname equals
 *      the path we asked for, with NO redirect to home. This is the strict
 *      signal: apps/demo/src/app/app.routes.ts ends in a `**` wildcard that
 *      `redirectTo: ''` (home), so a renamed/removed route silently redirects
 *      to `/` and still renders an <h1>/<main> + returns 200. A plain
 *      "renders something" check therefore passes for a broken route. Asserting
 *      the final pathname catches that.
 *   2. the route renders a visible <h1> or <main> (the SPA actually booted and
 *      the lazy route chunk resolved), and
 *   3. no console errors / uncaught page errors fired.
 *
 * Routes mirror apps/demo/src/app/app.routes.ts — update BOTH when a route in
 * this list is renamed. Every entry here MUST be a real (non-redirect) path;
 * redirect aliases (e.g. /architecture, /rxmethod) would fail the pathname
 * assertion by design.
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

/** Normalize a URL/path to a comparable pathname (strip origin, query, hash,
 * and any trailing slash except the root). */
function pathnameOf(urlOrPath: string): string {
  // Accept both absolute URLs (page.url()) and bare paths.
  const path = urlOrPath.startsWith('http')
    ? new URL(urlOrPath).pathname
    : urlOrPath.split(/[?#]/)[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

for (const route of ROUTES) {
  test(`route ${route} resolves (no redirect) and renders with no console errors`, async ({
    page,
  }) => {
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
    expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);

    // The SPA booted and the lazy route chunk rendered something real.
    await expect(
      page.locator('h1, main').first(),
      `no visible h1/main on ${route}`
    ).toBeVisible({ timeout: 20_000 });

    // STRICT: the router landed on the exact path we asked for. A removed or
    // renamed route hits the `**` wildcard and redirects to '' (home) — the
    // final pathname would then be '/', not the requested route. Give the
    // client-side redirect a beat to settle before reading the URL.
    await page.waitForTimeout(500);
    const landed = pathnameOf(page.url());
    const expected = pathnameOf(route);
    expect(
      landed,
      `route ${route} redirected to '${landed}' — it was renamed/removed (the ** wildcard sent it home), or the path in this list is stale`
    ).toBe(expected);

    expect(
      errors,
      `console/page errors on ${route}:\n${errors.join('\n')}`
    ).toEqual([]);
  });
}
