import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushToApp, readHandoffFromLocation } from './appSwitch';

describe('readHandoffFromLocation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('strips a valid handoff fragment synchronously and preserves path and query', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#handoff=Abcdefghijklmnopqrstuv_123456789', pathname: '/profile', search: '?from=admin' },
      history: { replaceState },
    });
    expect(readHandoffFromLocation()).toEqual({ code: 'Abcdefghijklmnopqrstuv_123456789' });
    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/profile?from=admin');
  });

  it('strips handoff error fragments without attempting redemption', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#handoff_error=no_session', pathname: '/', search: '' },
      history: { replaceState },
    });
    expect(readHandoffFromLocation()).toEqual({ error: 'no_session' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('strips malformed handoff codes and reports an invalid link', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#handoff=bad', pathname: '/', search: '' },
      history: { replaceState },
    });
    expect(readHandoffFromLocation()).toEqual({ error: 'invalid_link' });
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it('does not mutate unrelated URL fragments', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#/profile', pathname: '/', search: '' },
      history: { replaceState },
    });
    expect(readHandoffFromLocation()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});


describe('pushToApp automatic SSO policy', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function run(effectiveEnabled: boolean) {
    const assign = vi.fn();
    const post = vi.fn(async () => ({ code: 'Abcdefghijklmnopqrstuv_123456789', expires_in: 60 }));
    vi.stubGlobal('window', { location: { assign } });
    vi.stubGlobal('localStorage', { setItem: vi.fn(), removeItem: vi.fn() });
    const access = {
      admin: { allowed: true, url: 'https://admin.example.test', android_package: 'admin', apk_available: false },
      nurse: { allowed: true, url: 'https://nurse.example.test', android_package: 'nurse', apk_available: false },
      handoff_enabled: true,
      automatic_sso: { master_enabled: effectiveEnabled, user_enabled: effectiveEnabled, admin_allowed: effectiveEnabled, effective_enabled: effectiveEnabled },
    };
    const get = vi.fn(async () => access);
    const result = await pushToApp('nurse', { currentApp: 'admin', get, post });
    return { result, post, assign };
  }

  it('uses automatic mode only when the complete policy is effective', async () => {
    const enabled = await run(true);
    expect(enabled.result).toBe('navigated');
    expect(enabled.post).toHaveBeenCalledWith('/auth/handoff', { source_app: 'admin', target_app: 'nurse', mode: 'automatic' });
    const disabled = await run(false);
    expect(disabled.result).toBe('navigated');
    expect(disabled.post).toHaveBeenCalledWith('/auth/handoff', { source_app: 'admin', target_app: 'nurse', mode: 'manual' });
  });
});
