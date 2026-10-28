import { test, expect } from '@playwright/test';
import { mockAdminApi, signInReferenceAdmin } from './admin-fixtures';

test.describe('admin mobile/native shell contract', () => {
  test('uses the branded admin document title and mobile navigation', async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/login');
    await expect(page).toHaveTitle(/Well Nest Home Care Uganda Admin/);
    await signInReferenceAdmin(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin shortcuts' })).toBeVisible();
    await expect(page.locator('aside')).toBeHidden();
    await expect(page.getByRole('button', { name: /more/i })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });

  test('keeps the admin shell usable at tablet width before Android packaging', async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width: 820, height: 900 });
    await signInReferenceAdmin(page);
    await expect(page.getByRole('navigation', { name: 'Admin shortcuts' })).toBeHidden();
    await expect(page.locator('aside')).toBeVisible();
  });
});
