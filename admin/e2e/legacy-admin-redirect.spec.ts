import { expect, test } from '@playwright/test';

test('legacy /admin/login redirects to /login', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
});
