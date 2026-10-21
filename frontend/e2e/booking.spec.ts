import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { json, mockApi } from './helpers';

const ENQUIRIES = 'POST /api/v1/public/enquiries';

async function fillValidBooking(page: Page) {
  await page.getByLabel('Your name').fill('Grace Namukasa');
  await page.getByLabel('Phone number').fill('0787 499 988');
  await page.getByLabel('Who needs care').selectOption('parent');
  await page.locator('form button[aria-pressed]').first().click();
  await page.getByLabel('Area').fill('Ntinda');
  await page.getByLabel('I agree that Nest Home Care may contact me').check();
}

test('an empty booking form shows what is missing and sends nothing', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(page.getByText('Enter your name (2 to 80 characters).')).toBeVisible();
  await expect(page.getByText(/Enter a valid Uganda phone number/)).toBeVisible();
  await expect(page.getByText('Choose at least one kind of care.')).toBeVisible();
  await expect(page.getByText('Please tick the box so we can contact you.')).toBeVisible();
  expect(calls.filter((c) => c.startsWith('POST') && c.includes('enquiries'))).toEqual([]);
});

test('a phone number that is not Ugandan is refused', async ({ page }) => {
  await mockApi(page);
  await page.goto('/contact');
  await fillValidBooking(page);
  await page.getByLabel('Phone number').fill('12345');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(/Enter a valid Uganda phone number/)).toBeVisible();
});

test('a valid request is sent and the visitor gets a reference', async ({ page }) => {
  let sent: Record<string, unknown> = {};
  await mockApi(page, {
    [ENQUIRIES]: async (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      await json(201, { reference: 'NH-TEST-0001', whatsapp_url: 'https://wa.me/256787499988' })(
        route,
      );
    },
  });
  await page.goto('/contact');
  await fillValidBooking(page);
  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(
    page.getByRole('heading', { name: /A nurse will contact you shortly/ }),
  ).toBeVisible();
  await expect(page.getByText('Your request reference is NH-TEST-0001.')).toBeVisible();
  expect(sent).toMatchObject({ name: 'Grace Namukasa', area: 'Ntinda', relationship: 'parent' });
  expect(sent.phone).toBe('0787 499 988');
  expect(sent.website).toBe(''); // the honeypot stays empty for real visitors
});

test('when the server fails, the form keeps the answers and offers call and WhatsApp', async ({
  page,
}) => {
  await mockApi(page, { [ENQUIRIES]: json(500, { error: { code: 'server_error' } }) });
  await page.goto('/contact');
  await fillValidBooking(page);
  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t send that' })).toBeVisible();
  await expect(page.getByRole('alert').getByRole('link', { name: 'Call now' })).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Grace Namukasa');
});

test('too many requests shows the rate-limit message', async ({ page }) => {
  await mockApi(page, { [ENQUIRIES]: json(429, { error: { code: 'rate_limited' } }) });
  await page.goto('/contact');
  await fillValidBooking(page);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(/Too many requests from this device/)).toBeVisible();
});
