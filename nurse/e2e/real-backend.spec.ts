import { expect, test } from '@playwright/test';

// Track E4: real backend. Needs a seeded API (backend/scripts/seed_e2e.py) and a nurse build made with
// VITE_API_URL pointing at it. CI sets both; see .github/workflows/e2e-real-backend.yml.
const base = process.env.E2E_BASE_URL;
const api = (process.env.E2E_API_URL ?? '').replace(/\/$/, '');
const nurseEmail = process.env.E2E_NURSE_EMAIL ?? 'nurse-e2e@example.test';
const adminEmail = process.env.E2E_SUPERADMIN_EMAIL ?? 'e2e-admin@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2E-Only-Password-Change-Me!';

test.skip(!base || !api, 'Set E2E_BASE_URL and E2E_API_URL for the real-backend Track E workflow.');

// Same coordinates as PLACE_LAT / PLACE_LNG in backend/scripts/seed_e2e.py, so the arrival is verified.
test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 0.3476, longitude: 32.5825, accuracy: 20 },
});

async function bearer(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.post(`${api}/api/v1/auth/native/login`, {
    headers: { 'X-Client': 'native' },
    data: { email, password },
  });
  expect(response.ok(), `login for ${email}`).toBeTruthy();
  const body = await response.json();
  return { Authorization: `Bearer ${body.access_token}` };
}

test('nurse signs in, arrives, and the visit is in progress and visible to an admin', async ({
  page,
  request,
}) => {
  await page.goto(`${base}/`);
  await page.getByLabel('Email or phone').fill(nurseEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('E2E Client')).toBeVisible();
  await page.getByText('E2E Client').first().click();
  await page.getByRole('button', { name: 'Arrive', exact: true }).first().click();
  // The first arrival on a device shows the location disclosure, then continues to the arrival sheet.
  const accept = page.getByRole('button', { name: 'Accept and continue' });
  if (await accept.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await accept.click();
    await page.getByRole('button', { name: 'Continue to visits' }).click();
  }
  // The arrival sheet asks for one confirmation; after saving, the app returns to the Today list.
  await page.getByRole('button', { name: 'Confirm arrival' }).click();
  await expect(page.getByText('In progress').first()).toBeVisible();

  // Server-side proof, not just UI text: the nurse's visit is in progress...
  const nurse = await bearer(request, nurseEmail);
  await expect
    .poll(async () => {
      const r = await request.get(`${api}/api/v1/field/visits/visit-e2e-001`, { headers: nurse });
      return r.ok() ? (await r.json()).status : r.status();
    })
    .toBe('in_progress');

  // ...and the supervisor/admin side sees the same visit.
  const admin = await bearer(request, adminEmail);
  const adminView = await request.get(`${api}/api/v1/admin/care/visits/visit-e2e-001`, {
    headers: admin,
  });
  expect(adminView.ok()).toBeTruthy();
});
