export const API_PREFIX = '/api/v1';

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

/** Server error shape is {error: {code, message, fields}} (spec 9.1). Status 0 means the network failed. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  params?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Set false for login and refresh calls so a 401 is returned as-is. */
  retryOn401?: boolean;
  /** Extra request headers, for example `X-CSRF-Token` on refresh and logout. */
  headers?: Record<string, string>;
};

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  /** Called after a 401. Return true when the session was refreshed and the request may be retried once. */
  onUnauthorized?: () => Promise<boolean>;
};

export type ApiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
};

function buildUrl(baseUrl: string, path: string, params: RequestOptions['params']): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return `${baseUrl}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code ?? (response.status === 429 ? 'rate_limited' : 'http_error'),
    error?.message ?? response.statusText ?? 'Request failed',
    error?.fields ?? {},
  );
}

export function createApiClient({
  baseUrl,
  fetchImpl = (input, init) => fetch(input, init),
  getAccessToken,
  onUnauthorized,
}: ApiClientOptions): ApiClient {
  async function send(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
    isRetry: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path, options.params), {
        method,
        headers,
        credentials: 'include',
        signal: options.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network_error', 'Network request failed');
    }

    const canRetry = response.status === 401 && !isRetry && options.retryOn401 !== false;
    if (canRetry && onUnauthorized && (await onUnauthorized())) {
      return send(method, path, body, options, true);
    }
    return response;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await send(method, path, body, options, false);
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
    put: (path, body, options) => request('PUT', path, body, options),
  };
}

type AuthHooks = Pick<ApiClientOptions, 'getAccessToken' | 'onUnauthorized'>;
let authHooks: AuthHooks = {};

/**
 * The admin installs its token and refresh hooks here when it loads, so this file never imports
 * admin code and the public bundle stays free of it. Public calls carry no token.
 */
export function setAuthHooks(hooks: AuthHooks): void {
  authHooks = hooks;
}

export const apiClient: ApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getAccessToken: () => authHooks.getAccessToken?.() ?? null,
  onUnauthorized: () => authHooks.onUnauthorized?.() ?? Promise.resolve(false),
});
