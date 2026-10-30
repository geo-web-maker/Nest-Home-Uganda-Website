import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installMockApi, loginAsDemoNurse } from './fixtures';

const routes = ['/', '/profile', '/history', '/sync', '/timesheets'];

async function expectWcagClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const details = results.violations.map((item) => `${item.id} (${item.impact}): ${item.help}`).join('\n');
  expect(results.violations, details).toEqual([]);
}

test('authenticated nurse screens are WCAG AA clean in light and dark themes', async ({ page }) => {
  // Cards fade in and colours transition; axe would read half-blended colours mid-animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMockApi(page, { activeVisit: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsDemoNurse(page);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.nurse-app')).toBeVisible();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await expectWcagClean(page);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await expectWcagClean(page);
  }
});

test('arrival confirmation sheet is WCAG AA clean in light and dark themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Arrive opens the location notice on a nurse's first arrival; mark it as already accepted.
  await page.addInitScript(() => localStorage.setItem('nest.nurse.location-disclosure', 'true'));
  await installMockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsDemoNurse(page);
  await page.getByRole('link', { name: /Demo Client/i }).click();
  await page.getByRole('button', { name: 'Arrive' }).click();
  await expect(page.getByRole('dialog', { name: /confirm arrival at Demo Client/i })).toBeVisible();

  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expectWcagClean(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await expectWcagClean(page);
});
