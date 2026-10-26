import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { VisitDetail } from './VisitDetail';

const baseVisit: CachedVisit = {
  id: 'visit-1', client_display_name: 'Client One', place_address_text: 'Kampala address',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'scheduled', instructions: 'Use the front gate', adhoc: false, updatedAt: '2026-10-25T08:00:00.000Z',
  photo_rules: { allowed: true },
};
function renderDetail(visit: CachedVisit) {
  const onArrive = vi.fn(); const onLeave = vi.fn(); const onNote = vi.fn(); const onPhoto = vi.fn();
  render(<MemoryRouter><VisitDetail visit={visit} photosEnabled onArrive={onArrive} onLeave={onLeave} onNote={onNote} onPhoto={onPhoto} /></MemoryRouter>);
  return { onArrive, onLeave, onNote, onPhoto };
}

describe('visit detail actions', () => {
  it('shows the address, instructions and scheduled arrival action', () => {
    const handlers = renderDetail(baseVisit);
    expect(screen.getByText('Kampala address')).toBeTruthy();
    expect(screen.getByText('Use the front gate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
    expect(handlers.onArrive).toHaveBeenCalledWith(baseVisit);
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });

  it('offers departure only for an active visit and does not offer arrive/leave for completed work', () => {
    const active = { ...baseVisit, status: 'in_progress' as const };
    const { unmount } = render(<MemoryRouter><VisitDetail visit={active} photosEnabled onArrive={vi.fn()} onLeave={vi.fn()} onNote={vi.fn()} onPhoto={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Arrive' })).toBeNull();
    unmount();
    const completed = { ...baseVisit, status: 'completed' as const };
    renderDetail(completed);
    expect(screen.queryByRole('button', { name: 'Arrive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });
});
