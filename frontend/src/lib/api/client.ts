import { requestTotp } from '../totpPrompt';
import { BUILD_HEADER, CLIENT_BUILD, markUpgradeRequired } from './clientBuild';

export const API_PREFIX = '/api/v1';

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string>; request_id?: string }; detail?: unknown; message?: string };

/** Server error shape is {error: {code, message, fields}} (spec 9.1). Status 0 means the network failed. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly requestId?: string,
    public readonly endpoint?: string,
    /** Seconds the server asked us to wait (HTTP 429 Retry-After). */
    public readonly retryAfter?: number,
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
  getBlob(path: string, options?: RequestOptions): Promise<Blob>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
};

function buildUrl(baseUrl: string, path: string, params: RequestOptions['params']): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return `${baseUrl}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

async function isTotpRequired(response: Response): Promise<boolean> {
  try {
    const parsed = (await response.clone().json()) as ErrorBody;
    return parsed?.error?.code === 'totp_required';
  } catch {
    return false;
  }
}

async function toApiError(response: Response, endpoint: string): Promise<ApiError> {
  const raw = await response.text().catch(() => '');
  let body: ErrorBody | null = null;
  try { body = raw ? JSON.parse(raw) as ErrorBody : null; } catch { /* proxy/plain-text response */ }
  const error = body?.error;
  const detail = typeof body?.detail === 'string' ? body.detail : undefined;
  const message = error?.message || body?.message || detail ||
    (raw && raw.length < 500 ? raw : '') ||
    `The server returned HTTP ${response.status}${response.statusText ? ` (${response.statusText})` : ''} for ${endpoint}.`;
  return new ApiError(
    response.status,
    error?.code ?? (response.status === 429 ? 'rate_limited' : 'http_error'),
    message,
    error?.fields ?? {},
    error?.request_id ?? response.headers.get('X-Request-ID') ?? undefined,
    endpoint,
    Number(response.headers.get('Retry-After')) || undefined,
  );
}

/** Offline write queue hook: returns true when the write was saved on the device to send later. */
export type OfflineWriteHook = (method: string, path: string, body: unknown, reason: 'offline' | 'network') => Promise<boolean>;
let offlineWriteHook: OfflineWriteHook | null = null;
export function setOfflineWriteHook(hook: OfflineWriteHook | null): void { offlineWriteHook = hook; }
/**
 * Saved copies of GET replies. The admin installs a store (on-device, per signed-in user) so screens that fetch
 * through this client still show their last data when the network fails. Public pages install none.
 */
export type SavedCopyStore = {
  save(key: string, data: unknown): void;
  load(key: string): Promise<{ data: unknown; savedAt: number } | null>;
};
let savedCopyStore: SavedCopyStore | null = null;
export function setSavedCopyStore(store: SavedCopyStore | null): void { savedCopyStore = store; }
let staleSavedAt: number | null = null;
/** When the last GET was answered from a saved copy (ms since epoch), once; null if it was live. */
export function takeStaleSavedAt(): number | null { const v = staleSavedAt; staleSavedAt = null; return v; }
/** Told after every request whether the server answered, so the app can tell "offline" from "server unreachable". */
let networkObserver: ((reachable: boolean) => void) | null = null;
export function setNetworkObserver(fn: ((reachable: boolean) => void) | null): void { networkObserver = fn; }
let queuedFlag = false;
/** True once if the last write was saved for later instead of sent. */
export function takeQueuedFlag(): boolean { const v = queuedFlag; queuedFlag = false; return v; }

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
    totpAsked = false,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getAccessToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      // Only signed-in calls carry it, so public pages never trigger an extra CORS preflight.
      headers[BUILD_HEADER] = String(CLIENT_BUILD);
    }

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path, options.params), {
        method,
        headers,
        credentials: 'include',
        signal: options.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      const endpoint = `${method} ${API_PREFIX}${path}`;
      networkObserver?.(false);
      throw new ApiError(0, 'network_error',
        `Could not reach ${endpoint}. No HTTP response was received. Check your internet connection, API base URL, DNS/TLS, and browser CORS configuration. Browser detail: ${reason || 'network request blocked or interrupted'}.`,
        {}, undefined, endpoint);
    }

    networkObserver?.(true);
    if (response.status === 426) {
      // This copy of the app is older than the server allows. The admin shell reacts to this signal.
      markUpgradeRequired();
    }
    const canRetry = response.status === 401 && !isRetry && options.retryOn401 !== false;
    if (canRetry && onUnauthorized && (await onUnauthorized())) {
      return send(method, path, body, options, true, totpAsked);
    }
    // A locked action asks for the authenticator code first. The error only shows if they cancel.
    if (response.status === 403 && !totpAsked && !path.startsWith('/mail/totp/') && (await isTotpRequired(response))) {
      if (await requestTotp()) return send(method, path, body, options, isRetry, true);
    }
    return response;
  }

  async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
    const response = await send('GET', path, undefined, options, false);
    if (!response.ok) throw await toApiError(response, `GET ${API_PREFIX}${path}`);
    return response.blob();
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const canQueue = method !== 'GET' && offlineWriteHook !== null;
    if (canQueue && typeof navigator !== 'undefined' && !navigator.onLine && (await offlineWriteHook!(method, path, body, 'offline'))) {
      queuedFlag = true;
      return undefined as T;
    }
    const copyKey = method === 'GET' && savedCopyStore ? buildUrl(baseUrl, path, options.params) : null;
    let response: Response;
    try {
      response = await send(method, path, body, options, false);
    } catch (error) {
      if (copyKey && savedCopyStore && error instanceof ApiError && error.status === 0) {
        const saved = await savedCopyStore.load(copyKey).catch(() => null);
        if (saved) { staleSavedAt = saved.savedAt; return saved.data as T; }
      }
      if (canQueue && error instanceof ApiError && error.status === 0 && (await offlineWriteHook!(method, path, body, 'network'))) {
        queuedFlag = true;
        return undefined as T;
      }
      throw error;
    }
    if (!response.ok) throw await toApiError(response, `${method} ${API_PREFIX}${path}`);
    if (response.status === 204) return undefined as T;
    let parsed: T;
    try {
      parsed = (await response.json()) as T;
    } catch {
      // A 2xx that is not JSON is almost always a web page (the site's own shell or a proxy/CDN page), not the API.
      throw new ApiError(response.status, 'invalid_response', 'The reply was not from the Bloomwell API.', {}, undefined, `${method} ${API_PREFIX}${path}`);
    }
    if (copyKey && savedCopyStore) savedCopyStore.save(copyKey, parsed);
    return parsed;
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    getBlob: (path, options) => requestBlob(path, options),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
    put: (path, body, options) => request('PUT', path, body, options),
    delete: (path, options) => request('DELETE', path, undefined, options),
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
