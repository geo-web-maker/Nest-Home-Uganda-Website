import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHeartbeat } from './useHeartbeat';

vi.mock('../../lib/api/client', () => ({ apiRequest: vi.fn(() => Promise.resolve({ accepted: true })) }));
import { apiRequest } from '../../lib/api/client';

describe('useHeartbeat', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); sessionStorage.clear(); });
  it('does not send a heartbeat without an active visit', () => {
    sessionStorage.setItem('nurse_access_token', 'test-token');
    renderHook(() => useHeartbeat(true, undefined));
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('sends while a visit is active and stops its timer on cleanup', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('nurse_access_token', 'test-token');
    const hook = renderHook(() => useHeartbeat(true, 'visit-123'));
    await act(async () => { await Promise.resolve(); });
    expect(apiRequest).toHaveBeenCalledWith('/field/heartbeat', expect.objectContaining({ method: 'POST' }));
    vi.clearAllMocks();
    hook.unmount();
    await act(async () => { vi.advanceTimersByTime(120_000); await Promise.resolve(); });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
