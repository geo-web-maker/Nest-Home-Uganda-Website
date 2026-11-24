import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreNativeSession, WEB_CSRF_KEY, hasStoredWebCredential } from './client';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
const reply = (status: number, body: unknown = {}) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('web session restore', () => {
  it('does nothing without a stored credential', async () => { const f = reply(200); expect(hasStoredWebCredential()).toBe(false); expect(await restoreNativeSession()).toBeNull(); expect(f).not.toHaveBeenCalled(); });
  it('refreshes with the stored CSRF value and keeps the rotated one', async () => {
    localStorage.setItem(WEB_CSRF_KEY, 'old'); const f = reply(200, { access_token: 'a1', csrf_token: 'new' });
    expect(await restoreNativeSession()).toBe('a1');
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-CSRF-Token': 'old' });
    expect(localStorage.getItem(WEB_CSRF_KEY)).toBe('new'); expect(sessionStorage.getItem('nurse_access_token')).toBe('a1');
  });
  it('a refusal clears the credential; a server error keeps it', async () => {
    localStorage.setItem(WEB_CSRF_KEY, 'c'); reply(401); expect(await restoreNativeSession()).toBeNull(); expect(localStorage.getItem(WEB_CSRF_KEY)).toBeNull();
    localStorage.setItem(WEB_CSRF_KEY, 'c'); reply(503); await expect(restoreNativeSession()).rejects.toThrow(); expect(localStorage.getItem(WEB_CSRF_KEY)).toBe('c');
  });
  it('a network failure throws so the app stays on the cached account', async () => {
    localStorage.setItem(WEB_CSRF_KEY, 'c'); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await expect(restoreNativeSession()).rejects.toThrow();
  });
});
