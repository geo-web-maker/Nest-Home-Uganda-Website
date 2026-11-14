import { expect, test } from '@playwright/test';
import { mockAdminApi, signInReferenceAdmin, navigateToAdminPath } from './admin-fixtures';

test.describe('admin route coverage and responsive shell', () => {
  test('every implemented admin navigation entry opens its corresponding screen', async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInReferenceAdmin(page);
    await expect(page).toHaveURL(/\/$/);

    const destinations = [
      { label: 'Dashboard', heading: 'Dashboard' },
      { label: 'Enquiries', heading: 'Enquiries' },
      { label: 'Careers', heading: 'Careers' },
      { label: 'Applications', heading: 'Applications' },
      { label: 'Content', heading: 'Content' },
      { label: 'Site settings', heading: 'Site settings' },
      { label: 'Users and scopes', heading: 'Users and scopes' },
      { label: 'Reports', heading: 'Reports' },
      { label: 'Audit log', heading: 'Audit log' },
      { label: 'Clients', heading: 'Clients' },
      { label: 'Places & stays', heading: 'Places & stays' },
      { label: 'Nurses', heading: 'Nurses' },
      { label: 'Visits', heading: 'Visits' },
      { label: 'Flags', heading: 'Flags' },
      { label: 'My team', heading: 'My team' },
      { label: 'Alerts', heading: 'Alerts' },
      { label: 'Timesheets', heading: 'Timesheets' },
      { label: 'Photo review', heading: 'Visit photos' },
      { label: 'Care reports', heading: 'Care reports' },
      { label: 'SOS', heading: 'SOS response console' },
      { label: 'Care settings', heading: 'Care settings' },
      { label: 'Go-live checklist', heading: 'Care readiness' },
      { label: 'Data requests', heading: 'Data requests' },
    ];
    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    for (const destination of destinations) {
      await sidebar.getByRole('link', { name: destination.label, exact: true }).click();
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: destination.heading, exact: true }),
      ).toBeVisible();
    }
  });

  test('admin navigation switches correctly between phone, tablet and desktop layouts', async ({ page }) => {
    await mockAdminApi(page);
    await signInReferenceAdmin(page);

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 820 });
      await expect(page.getByRole('navigation', { name: 'Admin shortcuts' })).toBeVisible();
      await expect(page.locator('aside')).toBeHidden();
      const more = page.getByRole('button', { name: /more/i });
      await more.click();
      await expect(page.locator('#admin-more')).toBeVisible();
      await expect(page.locator('#admin-more').getByRole('link', { name: 'Site settings' })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `admin horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
      await more.click();
    }

    await page.setViewportSize({ width: 820, height: 900 });
    await expect(page.getByRole('navigation', { name: 'Admin shortcuts' })).toBeHidden();
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Site settings' })).toBeAttached();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('navigation', { name: 'Admin' }).getByText('Website', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin shortcuts' })).toBeHidden();
    const desktopDimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(desktopDimensions.content).toBeLessThanOrEqual(desktopDimensions.viewport);
  });
});

test.describe('admin website and care operations vs reference mockup', () => {
  test('groups implemented sections, exposes system controls, and saves typed gateway mode', async ({ page }) => {
    const api = await mockAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInReferenceAdmin(page);
    await expect(page).toHaveURL(/\/$/);
    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    for (const group of ['Website', 'Care operations', 'Monitoring', 'Safety', 'Setup']) {
      await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
    }
    await expect(sidebar.getByRole('link', { name: 'Clients' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Timesheets' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'SOS', exact: true })).toBeVisible();

    await sidebar.getByRole('link', { name: 'Site settings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Site settings' })).toBeVisible();
    await page.getByRole('tab', { name: 'System controls' }).click();
    const systemFields = [
      'Maintenance mode', 'Allow user registration', 'Enable beta features',
      'Maximum daily visits', 'Maximum items per user', 'Session timeout (minutes)',
      'Maximum upload size (MB)', 'Default sender email', 'Enable SMS notifications',
      'Webhook retry attempts', 'Payment gateway mode', 'API request timeout (seconds)',
      'Sync interval (minutes)', 'Platform site name', 'Default timezone', 'Support contact email',
    ];
    for (const label of systemFields) await expect(page.getByLabel(label)).toBeVisible();
    await expect(page.getByLabel('Maximum daily visits')).toHaveAttribute('min', '1');
    await expect(page.getByLabel('Maximum daily visits')).toHaveAttribute('max', '100000');
    await expect(page.getByLabel('Session timeout (minutes)')).toHaveAttribute('min', '5');
    await expect(page.getByLabel('Session timeout (minutes)')).toHaveAttribute('max', '1440');
    const gateway = page.getByRole('combobox', { name: 'Payment gateway mode' });
    await expect(gateway).toHaveValue('sandbox');
    await expect(gateway.locator('option')).toHaveCount(2);
    await gateway.selectOption('production');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect.poll(() => api.getSavedSettings()).toEqual({ PAYMENT_GATEWAY_MODE: 'production' });

    await sidebar.getByRole('link', { name: 'Visits' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Visits', exact: true })).toBeVisible();
    await expect(page.locator('.care-subnav')).toBeHidden();
  });
});
