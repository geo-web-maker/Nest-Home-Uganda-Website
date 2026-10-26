import { expect, test } from '@playwright/test';
test('nurse shell explains offline-first operation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nest Home Care Nurse' })).toBeVisible();
  await expect(page.getByText('Your visits stay available when the network is unavailable.')).toBeVisible();
});
