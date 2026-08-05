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
  '/stored-versioning', // stored() versioning + durability + 13.4 reload status
  '/guardrails', // guardrails monitoring panels (see content assertion below)
  '/realtime', // realtime enhancer teaching tabs
  '/form-marker', // form() marker: validation, wizard, history
  '/time-travel', // undo/redo history
  '/persistence', // persistence() enhancer
  '/enterprise-enhancer', // deprecated package (see content assertion below)
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

/**
 * CONTENT-level check for /guardrails.
 *
 * The shell assertions above pass even when every panel silently reads zero,
 * which is exactly how this page shipped broken: guardrails prefers core's
 * path-notifier (which only emits for entityMap collections), and this page's
 * state is plain objects, so no metric ever moved behind a UI that looked
 * wired up. Two things were needed to fix it — forcing the polling strategy,
 * AND spacing the scenario's writes so the poller can see them individually.
 *
 * Asserts on the RENDERED hot-path rows, not a number scraped from page text:
 * a loose text regex passed even with the page deliberately broken, because it
 * matched an unrelated figure elsewhere. This locator was verified to FAIL
 * against the synchronous-write version of the scenario.
 */
test('/guardrails hot-path panel populates after the scenario runs', async ({
  page,
}) => {
  await page.goto('/guardrails', { waitUntil: 'load' });
  await expect(page.locator('h1, main').first()).toBeVisible({
    timeout: 20_000,
  });

  // The introspection API must be attached at all.
  await expect(page.getByText(/not attached on this tree/i)).toHaveCount(0);

  // Empty state before the scenario runs.
  await expect(page.getByText(/No hot paths yet/i)).toBeVisible();

  await page.getByRole('button', { name: 'Trigger Hot Path' }).click();

  const hotPathItems = page.locator('.hotpaths-list li');
  await expect(hotPathItems.first()).toBeVisible({ timeout: 20_000 });
  expect(await hotPathItems.count()).toBeGreaterThan(0);
  await expect(page.getByText(/No hot paths yet/i)).toHaveCount(0);
});

/**
 * The enterprise page teaches an API that should no longer be adopted, so the
 * deprecation banner is the page's most important content. A unit spec already
 * asserts it renders; this checks it survives the production build and the
 * route actually resolves, which the unit spec cannot see.
 */
test('/enterprise-enhancer shows the deprecation banner and the core replacement', async ({
  page,
}) => {
  await page.goto('/enterprise-enhancer', { waitUntil: 'load' });

  const banner = page.locator('.deprecation-banner');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText(/deprecated/i);
  // The replacement must be named — a banner that says "deprecated" without
  // saying what to use instead just strands the reader.
  await expect(banner).toContainText('updateAndReport');

});
