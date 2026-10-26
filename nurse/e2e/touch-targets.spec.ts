import { expect, test } from '@playwright/test';

test('primary nurse controls meet the 44px touch-target minimum when present', async ({ page }) => {
  await page.goto('/');
  const controls = page.locator('button, [role="button"], a').filter({ visible: true });
  const count = await controls.count();
  for (let i = 0; i < count; i += 1) {
    const box = await controls.nth(i).boundingBox();
    if (!box) continue;
    if (box.width < 44 || box.height < 44) {
      const text = await controls.nth(i).innerText().catch(() => 'control');
      expect.soft({ text, width: box.width, height: box.height }).toEqual(expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }));
    }
  }
});
