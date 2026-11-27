import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const patch = vi.fn();
vi.mock('../../../lib/api/client', async (orig) => ({
  ...((await orig()) as object),
  apiClient: { patch: (...a: unknown[]) => patch(...a) },
}));

import { ApiError } from '../../../lib/api/client';
import { useAgreementDraftAutosave } from './useAgreementDraftAutosave';

const agreement = (value: string) => ({
  fields: {
    'party.name': { owner: 'client', revision: 1, value },
    'party.phone': { owner: 'client', revision: 1, value },
  },
});

function setup(drafts: Record<string, string>) {
  const viewRef = { current: agreement('') as never };
  const setError = vi.fn();
  const hook = renderHook(() => useAgreementDraftAutosave({
    step: 'review', drafts, viewRef, setView: vi.fn(), setError, loadReview: vi.fn(),
  }));
  return { ...hook, setError };
}

describe('useAgreementDraftAutosave', () => {
  beforeEach(() => { vi.useFakeTimers(); patch.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('never marks a field the server refused as saved', async () => {
    patch.mockResolvedValue({ ...agreement(''), rejected: { 'party.phone': 'Invalid number' } });
    const { result } = setup({ 'party.name': 'Ann', 'party.phone': 'x' });
    await act(async () => { await result.current.flushDrafts(); });
    expect(result.current.saveState['party.name']).toBe('saved');
    expect(result.current.saveState['party.phone']).toBe('error');
  });

  it('does not retry after a rate limit once the page has unmounted', async () => {
    patch.mockRejectedValue(new ApiError(429, 'rate_limited', 'slow down', {}, undefined, undefined, 5));
    const { result, unmount } = setup({ 'party.name': 'Ann' });
    await act(async () => { await result.current.flushDrafts(); });
    expect(patch).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
