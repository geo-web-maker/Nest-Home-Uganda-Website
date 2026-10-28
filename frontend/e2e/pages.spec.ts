import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

const PAGES = [
  { path: '/', h1: /comes home/i },
  { path: '/services', h1: /Eight kinds of care/i },
  { path: '/about', h1: /treats your family as ours/i },
  { path: '/team', h1: /Faces you can trust/i },
  { path: '/how-it-works', h1: /Clear steps, clear pricing/i },
  { path: '/areas', h1: /Home visits across Kampala/i },
  { path: '/faq', h1: /Answers to common questions/i },
  { path: '/careers', h1: /Join the team/i },
  { path: '/contact', h1: /Talk to us today/i },
  { path: '/privacy', h1: /safe with us/i },
];

for (const { path, h1 } of PAGES) {
  test(`${path} renders with a heading, title, description and no errors`, async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    await mockApi(page);

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
    expect(problems).toEqual([]);
  });
}

test('an unknown address shows the not-found page', async ({ page }) => {
  await mockApi(page);
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
});

test('the pre-rendered HTML already contains the content (SEO check)', async ({ request }) => {
  const html = await (await request.get('/services')).text();
  expect(html).toMatch(/<h1[^>]*>Eight kinds of care/);
  expect(html).toMatch(/<title[^>]*>[^<]+<\/title>/);
  expect(html).toMatch(/<meta[^>]*name="description"[^>]*content="[^"]+"/);
});

test('the services page lists the services from the API', async ({ page }) => {
  await mockApi(page);
  await page.goto('/services');
  await expect(page.getByRole('main').getByText('Elder care')).toBeVisible();
  await expect(page.getByRole('main').getByText('Newborn care')).toBeVisible();
});

test('the services page shows an error and a retry button when the API is down', async ({
  page,
}) => {
  await mockApi(page, {
    'GET /api/v1/public/services': (route) => route.fulfill({ status: 500, body: '{}' }),
  });
  await page.goto('/services');
  await expect(page.getByRole('button', { name: /try again|retry/i })).toBeVisible();
});
