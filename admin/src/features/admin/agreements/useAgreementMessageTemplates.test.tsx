import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
vi.mock('@shared/lib/api/client', async (orig) => ({
  ...(await orig<typeof import('@shared/lib/api/client')>()),
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: vi.fn() },
}));

import { dialogs } from '@shared/lib/dialogs';
import { useAgreementMessageTemplates } from './useAgreementMessageTemplates';

const msg = (body: string) => ({ subject: 's', preheader: 'p', body, button: 'b', footer_note: 'f' }) as never;
const confirm = vi.spyOn(dialogs, 'confirm');
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

function setup() {
  const cb = { setBusy: vi.fn(), setError: vi.fn(), setNotice: vi.fn() };
  return { ...renderHook(() => useAgreementMessageTemplates(cb)), cb };
}

describe('useAgreementMessageTemplates', () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); confirm.mockReset(); });

  it('keeps the newest message when an older load answers last', async () => {
    const slow = deferred<unknown>();
    get.mockImplementationOnce(() => slow.promise).mockResolvedValueOnce(msg('newer'));
    const { result } = setup();
    let first!: Promise<void>;
    act(() => { first = result.current.loadMessage('agreement_sent', 'email'); });
    await act(async () => { await result.current.loadMessage('agreement_signed' as never, 'email'); });
    await act(async () => { slow.resolve(msg('older')); await first; });
    expect(result.current.message?.body).toBe('newer');
  });

  it('asks before discarding unsaved edits and stays put when declined', async () => {
    get.mockResolvedValue(msg('saved'));
    confirm.mockResolvedValue(false);
    const { result } = setup();
    await act(async () => { await result.current.loadMessage('agreement_sent', 'email'); });
    act(() => result.current.setMessage(msg('edited')));
    await act(async () => { await result.current.changeMessageStage('agreement_signed' as never); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.current.messageStage).toBe('agreement_sent');
    expect(result.current.message?.body).toBe('edited');
  });

  it('does not prompt when nothing was edited', async () => {
    get.mockResolvedValue(msg('saved'));
    const { result } = setup();
    await act(async () => { await result.current.loadMessage('agreement_sent', 'email'); });
    await act(async () => { await result.current.changeMessageStage('agreement_signed' as never); });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms a reset, shows busy, and reports it', async () => {
    get.mockResolvedValue(msg('default'));
    post.mockResolvedValue({});
    confirm.mockResolvedValue(true);
    const { result, cb } = setup();
    await act(async () => { await result.current.loadMessage('agreement_sent', 'email'); });
    await act(async () => { await result.current.resetMessage(); });
    expect(cb.setBusy).toHaveBeenNthCalledWith(1, true);
    expect(cb.setBusy).toHaveBeenLastCalledWith(false);
    expect(cb.setNotice).toHaveBeenCalledWith(expect.stringContaining('default wording'));
  });
});
