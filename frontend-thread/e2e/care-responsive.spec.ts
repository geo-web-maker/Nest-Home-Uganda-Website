import { test, expect } from '@playwright/test';
import { mockPublicApi } from './helpers';

const widths = [360, 390, 700, 768, 1040, 1440];
const routes = [
  '/', '/services', '/how-it-works', '/about', '/team', '/areas',
  '/faq', '/faq/care-at-home', '/privacy', '/careers', '/careers/nurse-role', '/careers/general', '/contact',
  '/services/elderly-care',
];

test.beforeEach(async ({ page }) => { await mockPublicApi(page); });

for (const route of routes) {
  for (const width of widths) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${route} has no horizontal overflow at ${width}px in ${theme} theme`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => localStorage.setItem('nest-theme', value), theme);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expect(page.locator('h1')).toHaveCount(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-reveal="hidden"]')).toHaveCount(0);
      });
    }
  }
}
