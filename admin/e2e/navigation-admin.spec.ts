import { expect, test } from '@playwright/test';
import { mockAdminApi } from './admin-fixtures';

test('the admin area loads and asks for a sign-in', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/');
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
  await expect(page.getByLabel(/password/i).first()).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-server-rendered]')).toHaveCount(0);
});
