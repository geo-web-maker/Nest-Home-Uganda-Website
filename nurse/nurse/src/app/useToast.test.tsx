import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToast } from './useToast';

afterEach(() => vi.useRealTimers());

describe('useToast', () => {
  it('clears a status message after its configured duration', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(6_000));
    act(() => result.current[1]('Saved on this device.'));
    expect(result.current[0]).toBe('Saved on this device.');
    act(() => vi.advanceTimersByTime(5_999));
    expect(result.current[0]).toBe('Saved on this device.');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('');
  });

  it('restarts the expiry window when a newer message replaces the prior one', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(6_000));
    act(() => result.current[1]('First'));
    act(() => vi.advanceTimersByTime(4_000));
    act(() => result.current[1]('Second'));
    act(() => vi.advanceTimersByTime(5_999));
    expect(result.current[0]).toBe('Second');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('');
  });
});
