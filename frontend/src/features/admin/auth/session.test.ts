import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client';
import { authStore } from './authStore';
import { installAuthHooks, login, logout, refreshSession, restoreSession } from './session';

const USER = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.test',
  scopes: ['enquiries:read'],
  is_superadmin: false,
};
const session = (n: number) => ({
  access_token: `access-${n}`,
  token_type: 'bearer',
  expires_in: 900,
  csrf_token: `csrf-${n}`,
  user: USER,
});

function mockClient() {
  const post = vi.fn();
  const client = { get: vi.fn(), post, patch: vi.fn(), put: vi.fn() } satisfies ApiClient;
  return { client, post };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('session', () => {
  beforeEach(() => authStore.reset());

  it('login keeps the token and user in memory and stores only the CSRF token', async () => {
    const { client, post } = mockClient();
    post.mockResolvedValue(session(1));
    await login('ada@example.test', 'pw', client);

    expect(post).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'ada@example.test', password: 'pw' },
      { retryOn401: false },
    );
    expect(authStore.getState()).toMatchObject({
      status: 'signedIn',
      accessToken: 'access-1',
      user: USER,
    });
    expect(window.localStorage.getItem('nhc.csrf')).toBe('csrf-1');
    const stored = JSON.stringify({ ...window.localStorage });
    expect(stored).not.toContain('access-1');
    expect(stored).not.toContain('ada@example.test');
  });

  it('refresh sends the stored CSRF token in X-CSRF-Token and replaces the session', async () => {
    const { client, post } = mockClient();
    authStore.setSession(session(1));
    post.mockResolvedValue(session(2));

    await expect(refreshSession(client)).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/auth/refresh', undefined, {
      retryOn401: false,
      headers: { 'X-CSRF-Token': 'csrf-1' },
    });
    expect(authStore.getState().accessToken).toBe('access-2');
    expect(authStore.getCsrf()).toBe('csrf-2');
  });

  it('shares one request between parallel refresh calls', async () => {
    const { client, post } = mockClient();
    authStore.setSession(session(1));
    post.mockResolvedValue(session(2));

    await expect(Promise.all([refreshSession(client), refreshSession(client)])).resolves.toEqual([
      true,
      true,
    ]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('signs out and forgets the CSRF token when the server refuses the refresh', async () => {
    const { client, post } = mockClient();
    authStore.setSession(session(1));
    post.mockRejectedValue(new ApiError(401, 'unauthorised', 'Please sign in.'));

    await expect(refreshSession(client)).resolves.toBe(false);
    expect(authStore.getState()).toMatchObject({
      status: 'signedOut',
      accessToken: null,
      user: null,
    });
    expect(authStore.getCsrf()).toBeNull();
  });

  it('keeps a signed-in user signed in when the refresh fails on the network', async () => {
    const { client, post } = mockClient();
    authStore.setSession(session(1));
    post.mockRejectedValue(new ApiError(0, 'network_error', 'Network request failed'));

    await expect(refreshSession(client)).resolves.toBe(false);
    expect(authStore.getState().status).toBe('signedIn');
    expect(authStore.getCsrf()).toBe('csrf-1');
  });

  it('settles a first load on signed out without a request when there is no CSRF token', async () => {
    const { client, post } = mockClient();
    await restoreSession(client);
    expect(post).not.toHaveBeenCalled();
    expect(authStore.getState().status).toBe('signedOut');
  });

  it('settles a first load on signed out but keeps the token when the network fails', async () => {
    const { client, post } = mockClient();
    window.localStorage.setItem('nhc.csrf', 'csrf-1');
    post.mockRejectedValue(new ApiError(0, 'network_error', 'Network request failed'));
    await restoreSession(client);
    expect(authStore.getState().status).toBe('signedOut');
    expect(authStore.getCsrf()).toBe('csrf-1');
  });

  it('logout signs out first and still does so when the request fails', async () => {
    const { client, post } = mockClient();
    authStore.setSession(session(1));
    post.mockRejectedValue(new ApiError(500, 'server_error', 'Boom'));

    await logout(client);
    expect(post).toHaveBeenCalledWith('/auth/logout', undefined, {
      retryOn401: false,
      headers: { 'X-CSRF-Token': 'csrf-1' },
    });
    expect(authStore.getState().status).toBe('signedOut');
    expect(authStore.getCsrf()).toBeNull();
  });
});

describe('installAuthHooks with the shared client', () => {
  let uninstall: () => void;
  beforeEach(() => {
    authStore.reset();
    uninstall = installAuthHooks();
  });
  afterEach(() => {
    uninstall();
    vi.unstubAllGlobals();
  });

  it('refreshes once after a 401 and retries the call with the new token', async () => {
    authStore.setSession(session(1));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (url.endsWith('/auth/refresh')) return Promise.resolve(json(200, session(2)));
      return Promise.resolve(auth === 'Bearer access-2' ? json(200, { ok: true }) : json(401, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/admin/scopes')).resolves.toEqual({ ok: true });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(['/api/v1/admin/scopes', '/api/v1/auth/refresh', '/api/v1/admin/scopes']);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-1' });
  });

  it('ends signed out, with the 401 returned and no loop, when the refresh is refused', async () => {
    authStore.setSession(session(1));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(json(401, {})));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/admin/scopes')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // the call, then one refresh
    expect(authStore.getState().status).toBe('signedOut');
  });
});
