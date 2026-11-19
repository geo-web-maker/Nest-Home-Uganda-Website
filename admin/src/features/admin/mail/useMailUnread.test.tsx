import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient } from '@shared/lib/api/client';
import { MAIL_CHANGED_EVENT, MAIL_UNREAD_FOCUS_GAP_MS, MAIL_UNREAD_POLL_MS, useMailUnread } from './useMailUnread';

vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

describe('useMailUnread', () => {
  it('shows the total from the Mongo-backed unread endpoint, never the mailbox list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ unread: 7 });
    const { result } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(result.current).toBe(7));
    expect(apiClient.get).toHaveBeenCalledWith('/mail/unread');
    expect(apiClient.get).not.toHaveBeenCalledWith('/mail/mailboxes');
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
    vi.mocked(apiClient.get).mockResolvedValueOnce({ unread: 3 }).mockResolvedValueOnce({ unread: 1 });
    const { result } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(result.current).toBe(3));
    act(() => { window.dispatchEvent(new Event(MAIL_CHANGED_EVENT)); });
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('polls on the interval and stops after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.get).mockResolvedValue({ unread: 1 });
    const { unmount } = renderHook(() => useMailUnread(true, 1000));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('polls once a minute by default, because the endpoint never touches Neon', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.get).mockResolvedValue({ unread: 1 });
    const { unmount } = renderHook(() => useMailUnread(true));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(MAIL_UNREAD_POLL_MS); });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    unmount();
    vi.useRealTimers();
  });

  it('skips the timed poll while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.get).mockResolvedValue({ unread: 1 });
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { unmount } = renderHook(() => useMailUnread(true, 1000));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1)); // the first load always runs
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    unmount();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('refreshes when the tab is shown again, but not more often than the focus gap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.get).mockResolvedValue({ unread: 1 });
    const { unmount } = renderHook(() => useMailUnread(true, 10 * 60 * 60_000));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(apiClient.get).toHaveBeenCalledTimes(1); // just loaded, so too soon
    await act(async () => { await vi.advanceTimersByTimeAsync(MAIL_UNREAD_FOCUS_GAP_MS + 1); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(apiClient.get).toHaveBeenCalledTimes(2); // focus right after a load is ignored too
    unmount();
    vi.useRealTimers();
  });
});
