import { expect, test } from '@playwright/test';
test('nurse shell removes the legacy app masthead and presents the sign-in surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.locator('.app-header')).toHaveCount(0);
  await expect(page.getByLabel(/email or phone/i)).toBeVisible();
});
