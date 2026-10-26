import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { ActiveVisit } from './ActiveVisit';

const visit: CachedVisit = {
  id: 'active-visit-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T11:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, check_in_at: '2026-10-25T09:00:00.000Z',
  updatedAt: '2026-10-25T09:00:00.000Z',
};

afterEach(() => vi.useRealTimers());

describe('active visit elapsed timer', () => {
  it('derives elapsed time from the persisted check-in timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    render(<MemoryRouter><ActiveVisit visit={visit} onNote={vi.fn()} onPhoto={vi.fn()} onLeave={vi.fn()} photosEnabled={false} /></MemoryRouter>);
    expect(screen.getByText('01:00:00')).toBeTruthy();
    expect(screen.getByText(/timer is calculated from the saved visit time/i)).toBeTruthy();
  });
});
