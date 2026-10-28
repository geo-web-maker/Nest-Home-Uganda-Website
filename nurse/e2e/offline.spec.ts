import { expect, test } from '@playwright/test';

test('keeps the nurse workspace available when the connection is lost and restored', async ({ page, context }) => {
  await page.goto('/');
  const banner = page.locator('.connection-banner');
  await expect(page.getByRole('heading', { name: 'Well Nest Home Care Uganda Nurse' })).toBeVisible();
  await expect(banner.getByText('Online', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(banner.getByText('Offline', { exact: true })).toBeVisible();
  await expect(page.getByText(/stay on this device until reconnection/i)).toBeVisible();

  await context.setOffline(false);
  await expect(banner.getByText('Online', { exact: true })).toBeVisible();
});
