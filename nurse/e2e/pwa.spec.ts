import { expect, test } from '@playwright/test';

test('serves one valid web app manifest whose icons load', async ({ page, request }) => {
  await page.goto('/');
  const hrefs = await page.locator('link[rel="manifest"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toHaveLength(1);

  const response = await request.get(hrefs[0] as string);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe('Well Nest Home Care Uganda');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), `${icon.src} should load`).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain(icon.type);
  }
});

test('links the apple touch icon and the favicon', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
});
