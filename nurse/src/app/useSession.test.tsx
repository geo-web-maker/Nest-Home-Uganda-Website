import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../lib/api/client';
import { saveRefreshToken } from '../platform/secureTokenStorage';
import { useSession } from './useSession';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock('../lib/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('../platform/secureTokenStorage', () => ({ saveRefreshToken: vi.fn(), clearRefreshToken: vi.fn() }));

describe('nurse session hook', () => {
  beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false); });
  afterEach(() => { sessionStorage.clear(); });

  it('stores a web session and exposes its access token after successful sign-in', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ access_token: 'access-web', csrf_token: 'csrf-web' } as never);
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.signIn('nurse@example.test', 'password'); });
    expect(apiRequest).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(sessionStorage.getItem('nurse_access_token')).toBe('access-web');
    expect(sessionStorage.getItem('nurse_csrf_token')).toBe('csrf-web');
    expect(result.current.token).toBe('access-web');
  });

  it('uses native login and securely stores a supplied refresh token', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(apiRequest).mockResolvedValue({ access_token: 'access-native', refresh_token: 'refresh-native' } as never);
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.signIn('nurse@example.test', 'password'); });
    expect(apiRequest).toHaveBeenCalledWith('/auth/native/login', expect.objectContaining({ method: 'POST' }));
    expect(saveRefreshToken).toHaveBeenCalledWith('refresh-native');
    expect(sessionStorage.getItem('nurse_csrf_token')).toBeNull();
  });

  it('does not create a local session when the login API rejects', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('invalid credentials'));
    const { result } = renderHook(() => useSession());
    await expect(act(async () => { await result.current.signIn('nurse@example.test', 'wrong'); })).rejects.toThrow('invalid credentials');
    expect(sessionStorage.getItem('nurse_access_token')).toBeNull();
    expect(result.current.token).toBe('');
  });
});
