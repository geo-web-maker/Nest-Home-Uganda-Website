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
    fireEvent.pointerUp(button);
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
});
