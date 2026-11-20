import { apiRequest } from './client';
import { CLIENT_BUILD, isUpgradeRequired, resetUpgradeRequired } from '../clientBuild';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../../platform/secureTokenStorage', () => ({
  clearRefreshToken: vi.fn(),
  readRefreshToken: vi.fn(),
  saveRefreshToken: vi.fn(),
}));

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('apiRequest and the client build', () => {
  beforeEach(() => {
    resetUpgradeRequired();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends X-Client-Build once signed in', async () => {
    sessionStorage.setItem('nurse_access_token', 'tok');
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/mail/unread');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('X-Client-Build')).toBe(String(CLIENT_BUILD));
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('does not send it on signed-out calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/public/anything');
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).has('X-Client-Build')).toBe(false);
  });

  it('turns a 426 into a typed error and raises the update signal', async () => {
    sessionStorage.setItem('nurse_access_token', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(426, { error: { code: 'upgrade_required', message: 'Please update.' } })));
    await expect(apiRequest('/mail/mailboxes')).rejects.toMatchObject({ status: 426, code: 'upgrade_required', detail: 'Please update.' });
    expect(isUpgradeRequired()).toBe(true);
  });

  it('shows a pause as an error without asking for an update', async () => {
    sessionStorage.setItem('nurse_access_token', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(403, { error: { code: 'client_blocked', message: 'Paused.' } })));
    await expect(apiRequest('/mail/unread')).rejects.toMatchObject({ status: 403, code: 'client_blocked' });
    expect(isUpgradeRequired()).toBe(false);
  });
});
