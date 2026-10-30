import { expect, test } from '@playwright/test';

test('keeps the nurse workspace available when the connection is lost and restored', async ({ page, context }) => {
  await page.goto('/');
  const banner = page.locator('.connection-banner');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  // While online with nothing queued the shell shows no connection banner.
  await expect(banner).toHaveCount(0);

  await context.setOffline(true);
  await expect(banner.locator('strong')).toHaveText('Offline');
  await expect(banner).toContainText(/saved actions will stay on this device/i);

  await context.setOffline(false);
  await expect(page.locator('.connection-banner.is-offline')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
