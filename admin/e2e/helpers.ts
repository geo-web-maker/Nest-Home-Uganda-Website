import type { Page, Route } from '@playwright/test';

const SERVICES = [
  {
    id: 's1',
    slug: 'elder-care',
    name: 'Elder care',
    summary: 'Daily support for older adults.',
    number: 1,
    icon_key: null,
    photo_media_id: null,
  },
  {
    id: 's2',
    slug: 'newborn-care',
    name: 'Newborn care',
    summary: 'Support for mothers and babies.',
    number: 2,
    icon_key: null,
    photo_media_id: null,
  },
];

/** Every API call is answered here, so no test touches a real backend. */
export async function mockApi(
  page: Page,
  handlers: Record<string, (route: Route) => Promise<void> | void> = {},
): Promise<string[]> {
  const calls: string[] = [];
  const defaults: Record<string, (route: Route) => Promise<void> | void> = {
    'GET /api/v1/public/services': (route) => json(200, SERVICES)(route),
    'GET /api/v1/public/areas': (route) => json(200, [])(route),
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);
    const key = `${request.method()} ${path}`;
    const handler = handlers[key] ?? defaults[key];
    if (handler) return handler(route);
    return route.fulfill({ status: 204 });
  });
  return calls;
}

export function json(status: number, body: unknown) {
  return (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
