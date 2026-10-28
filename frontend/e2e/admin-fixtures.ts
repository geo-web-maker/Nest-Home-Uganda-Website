import type { Page, Route } from '@playwright/test';
import { json } from './helpers';

const LABEL_BY_ADMIN_PATH: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/activity': 'Audit log',
  '/admin/enquiries': 'Enquiries',
  '/admin/careers': 'Careers',
  '/admin/applications': 'Applications',
  '/admin/content': 'Content',
  '/admin/settings': 'Site settings',
  '/admin/users': 'Users and scopes',
  '/admin/reports': 'Reports',
  '/admin/care/clients': 'Clients',
  '/admin/care/places': 'Places & stays',
  '/admin/care/nurses': 'Nurses',
  '/admin/care/visits': 'Visits',
  '/admin/care/flags': 'Flags',
  '/admin/care/team': 'My team',
  '/admin/care/alerts': 'Alerts',
  '/admin/care/timesheets': 'Timesheets',
  '/admin/care/photos': 'Photo review',
  '/admin/care/reports/visits': 'Care reports',
  '/admin/care/sos': 'SOS',
  '/admin/care/settings': 'Care settings',
  '/admin/care/readiness': 'Go-live checklist',
  '/admin/care/data-requests': 'Data requests',
};

function adminSettings() {
  return [
    { key: 'system.MAINTENANCE_MODE', group: 'system', value: false },
    { key: 'system.ENABLE_USER_REGISTRATION', group: 'system', value: true },
    { key: 'system.ENABLE_BETA_FEATURES', group: 'system', value: false },
    { key: 'system.MAX_DAILY_VISITS', group: 'system', value: 50 },
    { key: 'system.MAX_ITEMS_PER_USER', group: 'system', value: 100 },
    { key: 'system.SESSION_TIMEOUT_MINUTES', group: 'system', value: 30 },
    { key: 'system.MAX_UPLOAD_SIZE_MB', group: 'system', value: 20 },
    { key: 'system.DEFAULT_SENDER_EMAIL', group: 'system', value: 'notifications@example.test' },
    { key: 'system.SMS_NOTIFICATIONS_ENABLED', group: 'system', value: false },
    { key: 'system.WEBHOOK_RETRY_ATTEMPTS', group: 'system', value: 3 },
    { key: 'system.PAYMENT_GATEWAY_MODE', group: 'system', value: 'sandbox' },
    { key: 'system.API_REQUEST_TIMEOUT_SEC', group: 'system', value: 20 },
    { key: 'system.SYNC_CRON_INTERVAL_MIN', group: 'system', value: 5 },
    { key: 'system.PLATFORM_SITE_NAME', group: 'system', value: 'Well Nest Home Care Uganda' },
    { key: 'system.DEFAULT_TIMEZONE', group: 'system', value: 'Africa/Kampala' },
    { key: 'system.SUPPORT_CONTACT_EMAIL', group: 'system', value: 'support@example.test' },
  ];
}

/** A deterministic, authenticated admin session for browser UI tests; no real API is contacted. */
export async function mockAdminApi(page: Page) {
  let savedSettings: Record<string, unknown> | undefined;
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === '/api/v1/auth/login' && method === 'POST') {
      await json(200, {
        access_token: 'reference-test-access-token',
        csrf_token: 'reference-test-csrf-token',
        expires_in: 3600,
        user: {
          id: 'reference-admin',
          name: 'Reference Admin',
          email: 'admin@example.test',
          scopes: [],
          is_superadmin: true,
        },
      })(route);
      return;
    }
    if (path === '/api/v1/admin/dashboard' && method === 'GET') {
      await json(200, {
        stats: {
          new_enquiries_this_week: 12,
          unanswered_over_reminder_minutes: 3,
          reminder_minutes: 30,
          applications_waiting: 5,
          care_started_this_month: 7,
        },
        enquiries_per_day: [{ date: 'Mon', count: 2 }, { date: 'Tue', count: 3 }],
        needs_reply: [],
        applications_waiting_by_job: [],
      })(route);
      return;
    }
    if (path === '/api/v1/admin/settings' && method === 'GET') {
      await json(200, adminSettings())(route);
      return;
    }
    if (path === '/api/v1/admin/settings/system' && method === 'PATCH') {
      savedSettings = request.postDataJSON() as Record<string, unknown>;
      await json(200, adminSettings())(route);
      return;
    }
    if (path === '/api/v1/admin/reports/summary' && method === 'GET') {
      await json(200, {
        enquiries_this_month: 18,
        reached_assessment_percent: 62,
        average_first_reply_minutes: 24,
        applications_count: 4,
        most_requested_services: [
          { name: 'Elder care', percentage: 45 },
          { name: 'Post-operative care', percentage: 30 },
        ],
      })(route);
      return;
    }
    if (path.startsWith('/api/v1/admin/care/') || path === '/api/v1/admin/activity') {
      await json(200, { items: [], status: 'ok', next_cursor: null })(route);
      return;
    }
    await json(200, { items: [], status: 'ok' })(route);
  });
  return { getSavedSettings: () => savedSettings };
}

/** Sign in without reloading the document; auth tokens are intentionally held in app memory. */
export async function signInReferenceAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin$/);
}

/** Navigate through the real SPA sidebar so the in-memory auth session stays alive. */
export async function navigateToAdminPath(page: Page, path: string) {
  const label = LABEL_BY_ADMIN_PATH[path];
  if (!label) throw new Error(`No UI navigation label configured for ${path}`);
  if (path === '/admin' && page.url().endsWith('/admin')) return;
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: label, exact: true }).click();
}
