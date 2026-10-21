import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

test('inner-page navigation focuses main content and updates the route marker', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/about');

  await page
    .getByRole('navigation', { name: 'Explore' })
    .getByRole('link', { name: 'Services', exact: true })
    .click();

  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Eight kinds of care/i);
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('main').locator('[data-route-path="/services"]')).toBeVisible();
});

test('an inner page remains visible when reduced motion is requested', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/treats your family as ours/i);
  await expect(page.getByRole('main')).toBeVisible();
});
