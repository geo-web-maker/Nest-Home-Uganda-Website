import { ApiError, apiClient, createApiClient, setAuthHooks } from './client';

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

const BASE = 'https://api.test';

describe('createApiClient', () => {
  it('sends JSON with credentials and a bearer token, and returns the parsed body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(200, { ok: true }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl, getAccessToken: () => 'tok' });
    const out = await client.post<{ ok: boolean }>('/auth/login', { a: 1 });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/api/v1/auth/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"a":1}' });
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    });
  });

  it('sends a JSON PUT for settings updates', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(200, { saved: true }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    await expect(client.put('/admin/care/settings/sms.monthly_cap', { value: 500 })).resolves.toEqual({ saved: true });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: '{"value":500}', credentials: 'include' });
  });

  it('builds the query string and skips empty params', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(200, []));
    await createApiClient({ baseUrl: BASE, fetchImpl }).get('/x', {
      params: { q: 'a b', page: 2, none: undefined, empty: '' },
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.test/api/v1/x?q=a+b&page=2');
  });

  it('throws ApiError with fields for a 422', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      json(422, {
        error: { code: 'validation_error', message: 'Bad', fields: { phone: 'bad' } },
      }),
    );
    const call = createApiClient({ baseUrl: BASE, fetchImpl }).post('/p', {});
    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Bad',
      fields: { phone: 'bad' },
    });
  });

  it('maps 429 without a body to rate_limited', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(429, null));
    await expect(createApiClient({ baseUrl: BASE, fetchImpl }).get('/x')).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    });
  });

  it('turns a network failure into status 0', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    await expect(createApiClient({ baseUrl: BASE, fetchImpl }).get('/x')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });

  it('retries once after a 401 when the session refreshes, then gives up', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { error: { code: 'unauthorized', message: 'No' } }))
      .mockResolvedValueOnce(json(200, { n: 1 }));
    const onUnauthorized = vi.fn().mockResolvedValue(true);
    const client = createApiClient({ baseUrl: BASE, fetchImpl, onUnauthorized });
    await expect(client.get('/me')).resolves.toEqual({ n: 1 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    const still401 = vi.fn<typeof fetch>().mockImplementation(async () => json(401, {}));
    const again = createApiClient({ baseUrl: BASE, fetchImpl: still401, onUnauthorized });
    await expect(again.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(still401).toHaveBeenCalledTimes(2);
  });

  it('does not retry when refresh fails or retryOn401 is false', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(401, {}));
    const failed = createApiClient({
      baseUrl: BASE,
      fetchImpl,
      onUnauthorized: () => Promise.resolve(false),
    });
    await expect(failed.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const onUnauthorized = vi.fn().mockResolvedValue(true);
    const login = createApiClient({ baseUrl: BASE, fetchImpl, onUnauthorized });
    await expect(login.post('/auth/login', {}, { retryOn401: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('sends extra headers from the request options', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(200, {}));
    await createApiClient({ baseUrl: BASE, fetchImpl }).post('/auth/refresh', undefined, {
      headers: { 'X-CSRF-Token': 'c1' },
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'c1' });
  });
});

describe('default apiClient auth hooks', () => {
  afterEach(() => {
    setAuthHooks({});
    vi.unstubAllGlobals();
  });

  it('sends no token until hooks are installed, then sends the installed one', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(json(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.get('/public/services');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');

    setAuthHooks({ getAccessToken: () => 'late-token' });
    await apiClient.get('/admin/scopes');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer late-token',
    });
  });
});
