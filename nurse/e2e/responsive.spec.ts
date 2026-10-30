import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

const routes = ['/', '/profile', '/history', '/sync', '/timesheets'];
const widths = [320, 360, 390, 699, 700, 768, 820, 1039, 1040, 1280];

test('Today and every primary nurse screen remain usable without horizontal overflow at mockup breakpoints', async ({ page }) => {
  await installMockApi(page, { activeVisit: true });
  await loginAsDemoNurse(page);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.nurse-app')).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        viewport: document.documentElement.clientWidth,
      }));
      expect(metrics.overflow, `${route} has horizontal overflow at ${width}px (viewport ${metrics.viewport}px)`).toBe(false);
      if (width < 700) {
        await expect(page.locator('.bottom-tabs')).toBeVisible();
        await expect(page.locator('.desktop-rail')).toBeHidden();
      } else {
        await expect(page.locator('.desktop-rail')).toBeVisible();
        await expect(page.locator('.bottom-tabs')).toBeHidden();
      }
    }
  }
});

test('Today pane and summary hide/show at the exact responsive breakpoints', async ({ page }) => {
  await installMockApi(page, { activeVisit: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsDemoNurse(page);

  for (const width of [699, 700, 1039, 1040]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 700) {
      await expect(page.locator('.mk-today__pane')).toBeHidden();
      await expect(page.locator('.mk-today__side')).toBeHidden();
    } else if (width < 1040) {
      await expect(page.locator('.mk-today__pane')).toBeVisible();
      await expect(page.locator('.mk-today__side')).toBeHidden();
    } else {
      await expect(page.locator('.mk-today__pane')).toBeVisible();
      await expect(page.locator('.mk-today__side')).toBeVisible();
    }
  }
});
