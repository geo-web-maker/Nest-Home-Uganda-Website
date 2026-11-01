import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { ArriveSheet } from './ArriveSheet';

const visit: CachedVisit = {
  id: 'visit-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'scheduled', instructions: '', adhoc: false, updatedAt: '2026-10-25T08:00:00.000Z',
};
function renderSheet(canEnableSafetyTimer: boolean) {
  const onConfirm = vi.fn(); const onSafetyTimerChange = vi.fn();
  render(<ArriveSheet visit={visit} location={null} locationState="denied" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={canEnableSafetyTimer} onSafetyTimerChange={onSafetyTimerChange} onConfirm={onConfirm} onCancel={vi.fn()} />);
  return { onConfirm, onSafetyTimerChange };
}

describe('arrival sheet', () => {
  it('allows arrival to be queued when location permission is denied', () => {
    const { onConfirm } = renderSheet(false);
    expect(screen.getByText(/permission was denied/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /confirm arrival/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a status chip for each location state without blocking arrival', () => {
    const { unmount } = render(<ArriveSheet visit={visit} location={{ lat: 0, lng: 0, accuracy_m: 8 }} locationState="good" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={false} onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Ready').closest('.mk-chip')).toHaveClass('mk-chip--ok');
    expect(screen.getByRole('status')).toHaveTextContent(/accuracy about 8 m/i);
    unmount();
    render(<ArriveSheet visit={visit} location={null} locationState="acquiring" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={false} onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Finding…').closest('.mk-chip')).toHaveClass('mk-chip--pd');
    expect(screen.getByRole('status')).toHaveTextContent(/getting your location/i);
  });

  it.each([
    ['low_accuracy', 'mk-chip--rv', 'Low accuracy', /accuracy is low/i],
    ['denied', 'mk-chip--bad', 'Denied', /permission was denied/i],
    ['unavailable', 'mk-chip--bad', 'Unavailable', /unavailable on this device/i],
  ] as const)('maps %s to the appropriate non-blocking location chip', (state, className, chipText, detailText) => {
    render(<ArriveSheet visit={visit} location={null} locationState={state} busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={false} onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(chipText).closest('.mk-chip')).toHaveClass(className);
    expect(screen.getByRole('status')).toHaveTextContent(detailText);
    expect(screen.getByRole('button', { name: /confirm arrival/i })).toBeEnabled();
  });

  it('only offers the safety timer when the organisation enables SOS and sends switch changes', () => {
    const { unmount } = render(<ArriveSheet visit={visit} location={null} locationState="unavailable" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={false} onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('switch')).toBeNull();
    unmount();
    const onSafetyTimerChange = vi.fn();
    render(<ArriveSheet visit={visit} location={null} locationState="unavailable" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer onSafetyTimerChange={onSafetyTimerChange} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: /lone-worker safety timer/i });
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(onSafetyTimerChange).toHaveBeenCalledWith(true);
  });
});
