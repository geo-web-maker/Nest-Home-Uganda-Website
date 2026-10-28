import { expect, test } from '@playwright/test';
import { mockAdminApi, navigateToAdminPath, signInReferenceAdmin } from './admin-fixtures';

const careRoutes = [
  { path: '/admin/care/nurses', label: 'Nurses' },
  { path: '/admin/care/visits', label: 'Visits' },
  { path: '/admin/care/alerts', label: 'Alerts' },
  { path: '/admin/care/sos', label: 'SOS' },
];
const widths = [320, 360, 390, 768, 820, 1280];

for (const width of widths) {
  for (const route of careRoutes) {
    test(`authenticated care responsive layout ${width}px ${route.path}`, async ({ page }) => {
      // Open the route with the desktop sidebar, then resize the real screen under test.
      // This keeps the auth session alive and avoids testing a hidden sidebar on mobile.
      await page.setViewportSize({ width: 1280, height: 900 });
      await mockAdminApi(page);
      await signInReferenceAdmin(page);
      await navigateToAdminPath(page, route.path);
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(route.path.replaceAll('/', '\\/') + '\\/?$'));
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${route.path} overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }
}
