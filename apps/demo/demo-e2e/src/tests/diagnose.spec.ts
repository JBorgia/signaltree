import { expect, test } from '@playwright/test';

test('diagnose page', async ({ page }) => {
  // page.on('console', (m) => console.log('PAGE>', m.text())); // Commented out by cleanup codemod
  await page.goto('http://localhost:4200/realistic-comparison', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(2000);
  const buttons = await page.$$eval('[role=button], button', (els) =>
    els.map((e) => e.textContent?.trim()).filter(Boolean)
  );
  const html = await page.$eval('app-root', (el) =>
    el.innerHTML.slice(0, 4000)
  );

  // Basic assertions to ensure page loaded correctly
  expect(buttons.length).toBeGreaterThan(0);
  expect(html.length).toBeGreaterThan(0);
});
