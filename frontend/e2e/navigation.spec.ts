import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

test('a visitor can move from the home page to services and to contact', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.locator('a[href="/services"]:visible').first().click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Eight kinds of care/i);

  await page.locator('a[href="/contact"]:visible').first().click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Talk to us today/i);
});

test('call and WhatsApp links point at the business number', async ({ page }) => {
  await mockApi(page);
  await page.goto('/contact');
  await expect(page.locator('a[href^="tel:+256787499988"]').first()).toBeAttached();
  await expect(page.locator('a[href^="https://wa.me/256787499988"]').first()).toBeAttached();
});

test('the admin area loads and asks for a sign-in', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin');
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
  await expect(page.getByLabel(/password/i).first()).toBeVisible();
});
