import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAdminApi, navigateToAdminPath, signInReferenceAdmin } from './admin-fixtures';

const careRoutes = [
  '/care/nurses',
  '/care/clients',
  '/care/places',
  '/care/visits',
  '/care/flags',
  '/care/team',
  '/care/photos',
  '/care/alerts',
  '/care/timesheets',
  '/care/sos',
  '/care/reports/visits',
  '/care/settings',
  '/care/readiness',
  '/care/data-requests',
  '/activity',
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
