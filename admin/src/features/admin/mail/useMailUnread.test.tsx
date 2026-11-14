import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient } from '@shared/lib/api/client';
import { MAIL_CHANGED_EVENT, useMailUnread } from './useMailUnread';

vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

describe('useMailUnread', () => {
  it('adds up unread counts across mailboxes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [{ unread_count: 2 }, { unread_count: 5 }] });
    const { result } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(result.current).toBe(7));
    expect(apiClient.get).toHaveBeenCalledWith('/mail/mailboxes');
  });

  it('asks for nothing and reports zero when mail is not enabled for the person', () => {
    const { result } = renderHook(() => useMailUnread(false));
    expect(result.current).toBe(0);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('shows no badge when the request fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(result.current).toBe(0);
  });

  it('refreshes at once when a mail screen reports a change', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [{ unread_count: 3 }] }).mockResolvedValueOnce({ items: [{ unread_count: 1 }] });
    const { result } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(result.current).toBe(3));
    act(() => { window.dispatchEvent(new Event(MAIL_CHANGED_EVENT)); });
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('polls on the interval and stops after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.get).mockResolvedValue({ items: [{ unread_count: 1 }] });
    const { unmount } = renderHook(() => useMailUnread(true, 1000));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
