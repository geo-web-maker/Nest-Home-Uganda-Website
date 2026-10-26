import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  '/admin/care/reports',
  '/admin/care/settings',
  '/admin/care/readiness',
  '/admin/care/data',
  '/admin/care/audit',
];

for (const route of careRoutes) {
  test(`axe: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    );
    expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
}
