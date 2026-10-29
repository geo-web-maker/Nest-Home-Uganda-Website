import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SosControl } from './SosSheet';

afterEach(() => vi.useRealTimers());

describe('SOS deliberate hold', () => {
  it('does not open the safety confirmation after a short tap', () => {
    vi.useFakeTimers();
    const onSend = vi.fn(async () => undefined);
    render(<SosControl enabled smsHref="sms:?body=help" onSend={onSend} />);
    const button = screen.getByRole('button', { name: /press and hold SOS for 2 seconds/i });
    fireEvent.pointerDown(button);
    expect(button.classList.contains('is-holding')).toBe(true);
    fireEvent.pointerUp(button);
    expect(button.classList.contains('is-holding')).toBe(false);
    act(() => { vi.advanceTimersByTime(2_500); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('opens the cancellation window only after a two-second hold', () => {
    vi.useFakeTimers();
    render(<SosControl enabled smsHref="sms:?body=help" onSend={vi.fn(async () => undefined)} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /press and hold SOS for 2 seconds/i }));
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/alert will be sent in 5 seconds/i)).toBeTruthy();
  });

  it('uses configured hold and cancellation durations', () => {
    vi.useFakeTimers();
    render(<SosControl enabled smsHref="sms:?body=help" holdSeconds={3} cancelWindowSeconds={4} onSend={vi.fn(async () => undefined)} />);
    const button = screen.getByRole('button', { name: /press and hold SOS/i });
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(2_500); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/alert will be sent in 4 seconds/i)).toBeTruthy();
  });
});


describe('SOS follow-up controls', () => {
  it('only offers safe confirmation for a server-confirmed SOS and sanitises call links', async () => {
    vi.useFakeTimers();
    const onSend = vi.fn(async () => ({ caseId: 'case-id-0001', serverConfirmed: true }));
    const onSafeNow = vi.fn(async () => undefined);
    render(<SosControl enabled smsHref="sms:?body=help" emergencyNumbers={["+256 701 234 567", "not-a-number"]} onSend={onSend} onSafeNow={onSafeNow} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /press and hold SOS for 2 seconds/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /call emergency number · \+256 701 234 567/i }).getAttribute('href')).toBe('tel:+256701234567');
    expect(screen.queryByRole('link', { name: /not-a-number/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /i’m safe now/i }));
    expect(onSafeNow).toHaveBeenCalledWith('case-id-0001');
  });
});
