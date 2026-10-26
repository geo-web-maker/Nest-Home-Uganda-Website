import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const nurseRoutes = ['/', '/history', '/profile', '/sync'];

for (const route of nurseRoutes) {
  test(`axe: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
}
