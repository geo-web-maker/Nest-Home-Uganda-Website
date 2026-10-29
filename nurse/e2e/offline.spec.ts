import { expect, test } from '@playwright/test';

test('keeps the nurse workspace available when the connection is lost and restored', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Well Nest Home Care Uganda' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Online' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible();
  await expect(page.getByText(/saved locally until you reconnect/i)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Online' })).toBeVisible();
});
