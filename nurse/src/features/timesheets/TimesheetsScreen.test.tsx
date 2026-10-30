import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api/client';
import { TimesheetsScreen } from './TimesheetsScreen';

vi.mock('../../lib/api/client', () => ({ apiRequest: vi.fn() }));

const ownedSheet = {
  id: 'timesheet-owner-001',
  period_start: '2026-10-19',
  period_end: '2026-10-25',
  period_kind: 'weekly',
  status: 'sent_back',
  completed_visits: 4,
  total_minutes: 315,
  issue_count: 1,
  issues: [{ number: 1, status: 'explained', explanation: 'Arrival signal was unavailable.' }],
  submitted_at: '2026-10-26T10:00:00Z',
  approved_at: null,
  sent_back_reason: 'Please clarify the visit.',
};

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('nurse timesheets', () => {
  it('uses only the field-owned endpoint and displays read-only period details', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [ownedSheet] } as never);
    render(<TimesheetsScreen online />);

    expect(await screen.findAllByText('Sent back')).toHaveLength(2);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/field/timesheets');
    expect(screen.getByText('Please clarify the visit.')).toBeInTheDocument();
    expect(screen.getByText('Arrival signal was unavailable.')).toBeInTheDocument();
    expect(document.querySelector('.mk-timesheets-layout')).toBeInTheDocument();
    expect(document.querySelector('.mk-timesheet-total')).toHaveTextContent('5 hr 15 min');
    expect(screen.getAllByText('Sent back').every((chip) => chip.className.includes('mk-chip--rv'))).toBe(true);
    expect(screen.getAllByText('5 hr 15 min')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
    expect(screen.queryByText('timesheet-owner-001')).toBeNull();
  });

  it('does not make a request or imply offline timesheets are cached', () => {
    render(<TimesheetsScreen online={false} />);
    expect(screen.getByText(/does not store timesheets offline/i)).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('allows retry after a field endpoint failure without changing permissions', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [ownedSheet] } as never);
    render(<TimesheetsScreen online />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByText('Please clarify the visit.')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiRequest).mock.calls.every(([path]) => path === '/field/timesheets')).toBe(true);
  });
});
