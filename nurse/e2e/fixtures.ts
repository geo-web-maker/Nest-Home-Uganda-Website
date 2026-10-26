import { expect, type Page } from '@playwright/test';

/**
 * Track E mocked-API fixture.
 *
 * The fixture deliberately intercepts only /api/v1/* requests. It never talks to a
 * real backend, so E1 remains deterministic and can run in the nurse preview server.
 */
export async function installMockApi(page: Page) {
  let syncPushes = 0;
  let notes: string[] = [];
  let photoQueued = false;
  let loggedOut = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (path === '/auth/native/login' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'e2-access', refresh_token: 'e2-refresh',
        user: { id: 'nurse-e2', display_name: 'Demo Nurse', role: 'nurse' },
      }) });
      return;
    }
    if (path === '/auth/native/refresh' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'e2-access', refresh_token: 'e2-refresh' }) });
      return;
    }
    if (path === '/field/me') {
      await route.fulfill({ status: loggedOut ? 401 : 200, contentType: 'application/json', body: JSON.stringify({ id: 'nurse-e2', display_name: 'Demo Nurse', role: 'nurse' }) });
      return;
    }
    if (path === '/field/visits' || path.startsWith('/field/visits?')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'visit-e2-001', client_id: 'client-e2', client_name: 'Demo Client', place_name: 'Demo Home', address: 'Kampala', scheduled_start: '2026-10-26T08:00:00Z', status: 'scheduled', instructions: 'Use the front entrance.' }] }) });
      return;
    }
    if (path === '/field/sync/push' && method === 'POST') {
      syncPushes += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: syncPushes === 1 ? 1 : 0, duplicates: syncPushes > 1 ? 1 : 0, conflicts: 0, rejected: 0 }) });
      return;
    }
    if (path.includes('/notes') && method === 'POST') {
      const body = request.postDataJSON() as { body?: string };
      notes.push(body.body ?? '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'accepted' }) });
      return;
    }
    if (path === '/field/photos/sign' && method === 'POST') {
      photoQueued = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ upload_url: `${url.origin}/mock-upload`, api_key: 'test', timestamp: 1, folder: 'test', public_id: 'photo-e2', signature: 'test' }) });
      return;
    }
    if (path === '/field/photos/complete' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: photoQueued ? 'accepted' : 'missing' }) });
      return;
    }
    if (path === '/auth/logout' || path === '/auth/native/logout') {
      loggedOut = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      return;
    }
    if (path === '/field/history') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }
    if (path === '/field/clients') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }
    if (path === '/field/inbox') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: 'ok' }) });
  });

  return {
    expectVisit: async () => expect(page.getByText('Demo Client')).toBeVisible(),
    getSyncPushCount: () => syncPushes,
    getNotes: () => [...notes],
  };
}

export async function loginAsDemoNurse(page: Page) {
  await page.goto('/');
  const identifier = page.getByLabel(/email|phone|identifier/i).first();
  const password = page.getByLabel(/password/i);
  if (await identifier.isVisible()) {
    await identifier.fill('nurse@example.test');
    await password.fill('Password123!');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  }
  await expect(page).not.toHaveURL(/login/i);
}
