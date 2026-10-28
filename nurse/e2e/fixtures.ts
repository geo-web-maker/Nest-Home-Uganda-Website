import { expect, type Page } from '@playwright/test';

/**
 * Track E mocked-API fixture.
 *
 * The fixture deliberately intercepts only /api/v1/* requests. It never talks to a
 * real backend, so E1 remains deterministic and can run in the nurse preview server.
 */
export async function installMockApi(page: Page, options: { activeVisit?: boolean } = {}) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? '';
  const visitStart = new Date(`${datePart('year')}-${datePart('month')}-${datePart('day')}T08:00:00+03:00`).toISOString();
  const visit = {
    id: 'visit-e2-001', client_display_name: 'Demo Client', place_address_text: 'Kampala',
    scheduled_start: visitStart, scheduled_end: new Date(Date.parse(visitStart) + 60 * 60 * 1000).toISOString(),
    status: options.activeVisit ? 'in_progress' : 'scheduled', instructions: 'Use the front entrance.',
    adhoc: false, check_in_at: options.activeVisit ? visitStart : null, check_out_at: null,
    safety_state: 'off', updated_at: new Date().toISOString(),
  };
  let syncPushes = 0;
  let notes: string[] = [];
  let photoQueued = false;
  let loggedOut = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    // If the build was made with VITE_API_URL set, API calls are cross-origin. A fulfilled mock has no
    // CORS headers, so the browser would reject it; answer preflights and add the headers to every reply.
    const cors = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const fulfill = route.fulfill.bind(route);
    route.fulfill = (options) => fulfill({ ...options, headers: { ...cors, ...options?.headers } });

    // Browser (non-native) sign-in: the app posts to /auth/login and expects a CSRF token back.
    if (path === '/auth/login' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'e2-access', csrf_token: 'e2-csrf',
        user: { id: 'nurse-e2', display_name: 'Demo Nurse', role: 'nurse' },
      }) });
      return;
    }
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
      await route.fulfill({ status: loggedOut ? 401 : 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 'nurse-e2', display_name: 'Demo Nurse', role: 'nurse', team_id: 'team-e2',
        consents_required: [], settings: { adhoc_allowed: false, photos_enabled: true, photo_max_mb: 5, sos_enabled: false, sos_disabled_reason: 'Not configured' },
      }) });
      return;
    }
    if (path === '/field/sync/pull') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [visit], cursor: null, has_more: false }) });
      return;
    }
    if (path === '/field/visits' || path.startsWith('/field/visits?')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
        id: visit.id, client_id: 'client-e2', client_name: 'Demo Client', place_name: 'Demo Home', address: 'Kampala',
        scheduled_start: visit.scheduled_start, scheduled_end: visit.scheduled_end, status: visit.status,
        check_in_at: visit.check_in_at, check_out_at: visit.check_out_at, instructions: visit.instructions,
      }] }) });
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
    if (path === '/field/app/version') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        latest: '0.1.0', min_supported: '0.0.0', download_path: null,
      }) });
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
  // Collected so a failed sign-in explains itself (an uncaught render error blanks the whole app).
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  await page.goto('/');
  const identifier = page.getByLabel(/email|phone|identifier/i).first();
  const password = page.getByLabel(/password/i);
  // Wait for either the sign-in form or the signed-in shell; isVisible() alone would not wait.
  await expect(identifier.or(page.locator('.bottom-tabs, .desktop-rail')).first()).toBeVisible();
  if (await identifier.isVisible()) {
    await identifier.fill('nurse@example.test');
    await password.fill('Password123!');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  }
  await expect(page).not.toHaveURL(/login/i);
  // Signed in once the shell navigation exists (both navs are in the DOM; CSS shows one).
  const shell = page.locator('.bottom-tabs, .desktop-rail').first();
  try {
    await expect(shell).toBeAttached();
  } catch (error) {
    const notice = await page.locator('.notice, [role="status"]').allTextContents();
    const body = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 300);
    throw new Error(
      `Sign-in did not reach the app shell.\nURL: ${page.url()}\nOn-screen status: ${JSON.stringify(notice)}\n` +
      `Body text: ${JSON.stringify(body)}\nBrowser problems:\n${problems.join('\n') || '(none)'}`,
      { cause: error },
    );
  }
}
