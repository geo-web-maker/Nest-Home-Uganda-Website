import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

const routes = ['/', '/history', '/profile', '/sync'];
const widths = [390, 820, 1280];

test('visible nurse navigation, buttons, visit cards and refresh controls meet 44px touch targets', async ({ page }) => {
  await installMockApi(page, { activeVisit: true });
  await loginAsDemoNurse(page);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.bottom-tabs, .desktop-rail').first()).toBeAttached();
    await page.waitForLoadState('networkidle');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const controls = page.locator('button:visible, .bottom-tabs a:visible, .desktop-rail a:visible, a.visit-card-link:visible');
      // Measure every control in one in-page pass. Re-querying each control lazily made the test wait
      // out its whole timeout whenever the page re-rendered and a button disappeared mid-loop.
      const measured = await controls.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const label = (element.textContent ?? '').trim().slice(0, 80) || element.getAttribute('aria-label') || 'unnamed control';
        return { label, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
      }));
      const undersized = measured.filter((box) => box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44));
      expect(undersized, `${route} at ${width}px has undersized controls: ${JSON.stringify(undersized)}`).toEqual([]);
    }
  }
});

test('phone sign-in inputs and submit action remain labelled and comfortably tappable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByLabel(/email or phone/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  const submit = page.getByRole('button', { name: /sign in/i });
  const box = await submit.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
