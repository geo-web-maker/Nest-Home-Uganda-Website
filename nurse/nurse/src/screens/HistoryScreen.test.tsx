import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedHistoryVisit } from '../offline/db';
import { HistoryScreen } from './HistoryScreen';

const row: CachedHistoryVisit = {
  id: 'visit-old', client_display_name: 'Client One', scheduled_start: '2026-10-20T08:00:00.000Z',
  scheduled_end: '2026-10-20T09:00:00.000Z', check_in_at: '2026-10-20T08:01:00.000Z',
  check_out_at: '2026-10-20T08:58:00.000Z', status: 'completed', verification_label: 'verified',
};

describe('history screen', () => {
  it('shows an empty state and makes no implicit page request', () => {
    const onLoadMore = vi.fn();
    render(<HistoryScreen history={[]} loading={false} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.getByText(/no visit history yet/i)).toBeTruthy();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('shows server-derived verification and requests another page only after selection', () => {
    const onLoadMore = vi.fn();
    render(<HistoryScreen history={[row]} loading={false} hasMore onLoadMore={onLoadMore} />);
    expect(screen.getByText('Client One')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.queryByText(/visit-old/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /load more visits/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('labels a visit with unsent local work as pending sync and exposes read-only arrival/departure details', () => {
    render(<HistoryScreen history={[row]} loading={false} hasMore={false} onLoadMore={vi.fn()} pendingVisitIds={['visit-old']} />);
    expect(screen.getByText('Pending sync')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /client one/i }));
    expect(screen.getByText(/Read-only details/i)).toBeTruthy();
    expect(screen.getByText(/Arrival recorded/i)).toBeTruthy();
    expect(screen.getByText(/Departure recorded/i)).toBeTruthy();
    expect(screen.getByText(/visit-old/)).toBeTruthy();
    expect(screen.queryByText(/distance/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /hide past visit details/i }));
    expect(screen.queryByText(/Read-only details/i)).toBeNull();
  });
});
