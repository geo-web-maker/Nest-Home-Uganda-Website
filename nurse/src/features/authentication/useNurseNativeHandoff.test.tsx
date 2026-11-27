import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redeem = vi.fn();
vi.mock('../../platform/appSwitch', () => ({ redeem: (...args: unknown[]) => redeem(...args) }));
vi.mock('../../lib/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('../../offline/db', () => ({ nurseDb: { outbox: { count: async () => 0 }, photos: { count: async () => 0 } } }));
vi.mock('../../platform/secureTokenStorage', () => ({ saveRefreshToken: vi.fn(async () => undefined) }));
vi.mock('../../lib/api/webCredential', () => ({ saveWebCredential: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { useNurseNativeHandoff } from './useNurseNativeHandoff';

const CODE = 'a'.repeat(30);
const session = { access_token: 'tok', csrf_token: 'csrf', user: { id: 'u1', name: 'N', email: 'n@x', scopes: [], is_superadmin: false } };

function setup(overrides: Partial<Parameters<typeof useNurseNativeHandoff>[0]> = {}) {
  const options = {
    completeSignIn: vi.fn(async () => undefined),
    clearProfile: vi.fn(),
    setLoginError: vi.fn(),
    setMessage: vi.fn(),
    setToken: vi.fn(),
    setOfflineTrusted: vi.fn(),
    signOutLocal: vi.fn(async () => undefined),
    ...overrides,
  };
  renderHook(() => useNurseNativeHandoff(options));
  return options;
}
const fire = () => window.dispatchEvent(new CustomEvent('nhc:native-handoff', { detail: { code: CODE } }));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('useNurseNativeHandoff', () => {
  beforeEach(() => { redeem.mockReset(); sessionStorage.clear(); localStorage.clear(); });

  it('redeems a one-time code once even if the event fires twice', async () => {
    redeem.mockImplementation(() => new Promise((r) => setTimeout(() => r(session), 5)));
    const o = setup();
    fire(); fire();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(redeem).toHaveBeenCalledTimes(1);
    expect(o.completeSignIn).toHaveBeenCalledTimes(1);
    expect(o.setMessage).not.toHaveBeenCalled();
  });

  it('writes nothing when the response lacks the CSRF token', async () => {
    redeem.mockResolvedValue({ ...session, csrf_token: undefined });
    const o = setup();
    fire(); await flush();
    expect(sessionStorage.getItem('nurse_access_token')).toBeNull();
    expect(o.setToken).not.toHaveBeenCalled();
    expect(o.setMessage).toHaveBeenCalledWith('We could not sign you in automatically. Please sign in.');
  });

  it('reports a data-load failure after sign-in separately from a handoff failure', async () => {
    redeem.mockResolvedValue(session);
    const o = setup({ completeSignIn: vi.fn(async () => { throw new Error('offline'); }) });
    fire(); await flush();
    expect(o.setMessage).toHaveBeenCalledWith(expect.stringContaining('data could not be loaded'));
  });
});
