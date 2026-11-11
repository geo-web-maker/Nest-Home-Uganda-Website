import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockPublicApi } from './helpers';

const routes = ['/', '/services', '/services/elderly-care', '/how-it-works', '/about', '/team', '/areas', '/faq', '/faq/care-at-home', '/privacy', '/careers', '/careers/nurse-role', '/careers/general', '/contact'];

// Reduced motion skips the scroll-reveal fade, so axe never samples text mid-transition (blended colours cause flaky contrast results).
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); await mockPublicApi(page); });

for (const route of routes) {
  test(`public route ${route} has core landmarks and no serious axe violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
  });
}

test('booking form keeps the required medical-details warning and hidden honeypot', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByText('Please do not enter medical details here')).toBeVisible();
  const honeypot = page.locator('input[name="website"]');
  await expect(honeypot).toHaveCount(1);
  // An off-screen trap, not display:none, so bots still fill it. Humans and screen readers never reach it.
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot.locator('xpath=ancestor::div[@aria-hidden="true"]')).toHaveCount(1);
  expect((await honeypot.boundingBox())!.x).toBeLessThan(0);
});
