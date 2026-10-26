import { expect, test } from '@playwright/test';

const careRoutes = [
  '/admin/care/nurses',
  '/admin/care/visits',
  '/admin/care/alerts',
  '/admin/care/sos',
];
const widths = [360, 390, 768, 1280];

for (const width of widths) {
  for (const route of careRoutes) {
    test(`care responsive ${width}px ${route}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 800 });
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);
    });
  }
}
