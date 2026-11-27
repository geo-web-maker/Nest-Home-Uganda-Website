import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHandoffFromLocation } from './appSwitch';

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
