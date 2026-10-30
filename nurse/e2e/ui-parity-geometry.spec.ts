import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

test.describe('nurse mockup parity geometry and responsive landmarks', () => {
  test('switches layout at 700px and 1040px without overflow', async ({ page }) => {
    await installMockApi(page, { activeVisit: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDemoNurse(page);

    await expect(page.locator('.bottom-tabs')).toBeVisible();
    await expect(page.locator('.desktop-rail')).toBeHidden();
    await expect(page.locator('.mk-today__pane')).toBeHidden();

    for (const width of [699, 700, 1039, 1040, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(hasOverflow, `horizontal overflow at ${width}px`).toBe(false);
      if (width < 700) {
        await expect(page.locator('.bottom-tabs')).toBeVisible();
        await expect(page.locator('.desktop-rail')).toBeHidden();
      } else {
        await expect(page.locator('.desktop-rail')).toBeVisible();
        await expect(page.locator('.bottom-tabs')).toBeHidden();
        await expect(page.locator('.mk-today__pane')).toBeVisible();
      }
      if (width < 1040) await expect(page.locator('.mk-today__side')).toBeHidden();
      else await expect(page.locator('.mk-today__side')).toBeVisible();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    const metrics = await page.evaluate(() => {
      const rail = document.querySelector('.desktop-rail');
      const today = document.querySelector('.mk-today');
      const card = document.querySelector('.visit-card');
      return {
        rail: rail ? getComputedStyle(rail).width : null,
        columns: today ? getComputedStyle(today).gridTemplateColumns.split(' ').length : 0,
        cardRadius: card ? getComputedStyle(card).borderTopLeftRadius : null,
      };
    });
    expect(metrics.rail).toBe('96px');
    expect(metrics.columns).toBe(3);
    expect(metrics.cardRadius).toBe('28px');
    await expect(page.locator('.mk-active-visit .mk-timer')).toHaveAttribute('aria-live', 'off');
  });

  test('duplicates navigation with matching aria-current values and correct small-screen pane hiding', async ({ page }) => {
    await installMockApi(page, { activeVisit: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDemoNurse(page);
    const navs = page.getByRole('navigation', { name: 'Main navigation', includeHidden: true });
    await expect(navs).toHaveCount(2);
    const todayStates = await navs.locator('a').evaluateAll((links) => links.map((link) => [link.textContent?.trim(), link.getAttribute('aria-current')]));
    expect(todayStates[0]).toEqual(todayStates[1]);
    await expect(page.getByRole('complementary', { name: 'Current visit' })).toBeHidden();
    await expect(page.locator('.visit-card-link').first()).toBeVisible();
  });
});


test('Today summary matches the local schedule: totals, completed work and next Kampala start', async ({ page }) => {
  await installMockApi(page, { multipleVisits: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsDemoNurse(page);
  const summary = page.getByRole('complementary', { name: 'Today summary' });
  await expect(summary).toContainText('3');
  await expect(summary).toContainText('1');
  await expect(summary).toContainText('11:00');
  await expect(page.locator('.visit-card h3')).toHaveText(['Esther Namugga', 'John Ddungu', 'Mary Kisakye']);
});
