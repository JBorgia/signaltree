import { test } from '@playwright/test';

test('diagnose page', async ({ page }) => {
  page.on('console', (m) => console.log('PAGE>', m.text()));
  await page.goto('http://localhost:4200/realistic-comparison', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(2000);
  const buttons = await page.$$eval('[role=button], button', (els) =>
    els.map((e) => e.textContent?.trim()).filter(Boolean)
  );
  console.log('BUTTONS:\n', buttons.join('\n'));
  const html = await page.$eval('app-root', (el) =>
    el.innerHTML.slice(0, 4000)
  );
  console.log('APP ROOT HTML SNIPPET:\n', html);
});
