import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

test.describe('nurse app reference fidelity', () => {
  test('uses bottom tabs on phones, then the reference desktop rail on wide screens', async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDemoNurse(page);
    await expect(page.locator('.bottom-tabs')).toBeVisible();
    await expect(page.locator('.desktop-rail')).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.desktop-rail')).toBeVisible();
    await expect(page.locator('.bottom-tabs')).toBeHidden();
    const rail = page.locator('.desktop-rail');
    await expect(rail.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'History' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Profile' })).toBeVisible();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  });

  test('shows the schedule and active-visit detail pane on desktop when a visit is in progress', async ({ page }) => {
    await installMockApi(page, { activeVisit: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsDemoNurse(page);
    await expect(page.getByRole('heading', { name: 'Visit schedule' })).toBeVisible();
    const currentVisit = page.getByRole('complementary', { name: 'Current visit' });
    await expect(currentVisit.getByRole('heading', { name: 'Demo Client' })).toBeVisible();
    await expect(currentVisit.getByText('Kampala')).toBeVisible();
    await expect(currentVisit.getByText('Use the front entrance.')).toBeVisible();
    await expect(currentVisit.getByRole('link', { name: /continue active visit/i })).toHaveAttribute('href', '/active/visit-e2-001');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(currentVisit).toBeHidden();
    // The hidden desktop pane still holds a "Demo Client" heading, so count only the visible one.
    await expect(page.getByRole('heading', { name: 'Demo Client' }).filter({ visible: true })).toHaveCount(1);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });

  test('keeps the mobile schedule usable without horizontal overflow', async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await loginAsDemoNurse(page);
    // The name also appears in the selected-visit pane and a summary row, so target the schedule card link.
    await expect(page.getByRole('link', { name: /Demo Client/ }).first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });
});

test('visit detail keeps Back to Today on phone and removes it at the tablet breakpoint', async ({ page }) => {
  await installMockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsDemoNurse(page);
  await page.getByRole('link', { name: /Demo Client/i }).click();
  await expect(page.getByRole('link', { name: /back to today/i })).toBeVisible();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByRole('link', { name: /back to today/i })).toBeHidden();
  await page.setViewportSize({ width: 699, height: 900 });
  await expect(page.getByRole('link', { name: /back to today/i })).toBeVisible();
});
