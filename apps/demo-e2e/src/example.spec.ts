import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect the main h1 to contain the brand name
  expect(await page.locator('main h1').innerText()).toContain('SignalTree');
});
