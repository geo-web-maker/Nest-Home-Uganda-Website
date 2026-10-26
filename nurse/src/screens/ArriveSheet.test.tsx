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

  it('only offers the safety timer when the organisation enables SOS', () => {
    const { unmount } = render(<ArriveSheet visit={visit} location={null} locationState="unavailable" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer={false} onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();
    render(<ArriveSheet visit={visit} location={null} locationState="unavailable" busy={false} safetyTimerEnabled={false} canEnableSafetyTimer onSafetyTimerChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });
});
