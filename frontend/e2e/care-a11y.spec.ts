import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAdminApi, navigateToAdminPath, signInReferenceAdmin } from './admin-fixtures';

const careRoutes = [
  '/admin/care/nurses',
  '/admin/care/clients',
  '/admin/care/places',
  '/admin/care/visits',
  '/admin/care/flags',
  '/admin/care/team',
  '/admin/care/photos',
  '/admin/care/alerts',
  '/admin/care/timesheets',
  '/admin/care/sos',
  '/admin/care/reports/visits',
  '/admin/care/settings',
  '/admin/care/readiness',
  '/admin/care/data-requests',
  '/admin/activity',
];

for (const route of careRoutes) {
  test(`authenticated axe audit: ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockAdminApi(page);
    await signInReferenceAdmin(page);
    await navigateToAdminPath(page, route);
    await expect(page.getByRole('main')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    );
    expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
}
