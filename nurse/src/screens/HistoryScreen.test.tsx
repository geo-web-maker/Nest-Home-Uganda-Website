import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedHistoryVisit } from '../offline/db';
import { HistoryScreen } from './HistoryScreen';

const row: CachedHistoryVisit = { id: 'visit-old', scheduled_start: '2026-10-20T08:00:00.000Z', scheduled_end: '2026-10-20T09:00:00.000Z', status: 'completed' };

describe('history screen', () => {
  it('shows an empty state and makes no implicit page request', () => {
    const onLoadMore = vi.fn();
    render(<HistoryScreen history={[]} loading={false} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.getByText(/no visit history yet/i)).toBeTruthy();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('lists cached history and requests another page only after selection', () => {
    const onLoadMore = vi.fn();
    render(<HistoryScreen history={[row]} loading={false} hasMore onLoadMore={onLoadMore} />);
    expect(screen.getByText(/Reference: visit-old/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /load more visits/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
