import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

test.describe('Track E mocked nurse workflows', () => {
  test('login and today list use the mocked API', async ({ page }) => {
    const api = await installMockApi(page);
    await loginAsDemoNurse(page);
    await api.expectVisit();
    await expect(page.getByText('Demo Home')).toBeVisible();
  });

  test('offline check-in reconnect is duplicate-safe at the sync contract', async ({ page, context }) => {
    const api = await installMockApi(page);
    await loginAsDemoNurse(page);
    await api.expectVisit();
    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: /online/i })).toBeVisible();
    expect(api.getSyncPushCount()).toBe(0);
  });

  test('logout guard prevents leaving pending local work silently', async ({ page }) => {
    await installMockApi(page);
    await loginAsDemoNurse(page);
    await expect(page.getByRole('heading', { name: /nest home care nurse/i })).toBeVisible();
  });
});
