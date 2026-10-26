import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone-small', width: 360, height: 640 },
  { name: 'phone-large', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const viewport of viewports) {
  test(`responsive ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(horizontalOverflow).toBe(false);
    if (viewport.width <= 768) {
      const tabs = page.locator('nav').first();
      if (await tabs.count()) await expect(tabs).toBeVisible();
    }
  });
}
