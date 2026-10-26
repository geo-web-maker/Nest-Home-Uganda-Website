import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { VisitCard } from './VisitCard';

const baseVisit: CachedVisit = {
  id: 'visit-123', client_display_name: 'Test client', place_address_text: 'Test address',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'scheduled', instructions: 'Use front entrance', adhoc: false, updatedAt: '2026-10-25T08:00:00.000Z',
};
function renderCard(visit: CachedVisit) {
  const onArrive = vi.fn(); const onLeave = vi.fn(); const onNote = vi.fn(); const onPhoto = vi.fn();
  const result = render(<MemoryRouter><VisitCard visit={visit} photosEnabled onArrive={onArrive} onLeave={onLeave} onNote={onNote} onPhoto={onPhoto} /></MemoryRouter>);
  return { ...result, onArrive, onLeave, onNote, onPhoto };
}

describe('visit card action matrix', () => {
  it('offers arrival for a scheduled visit but not departure', () => {
    const { onArrive, onLeave } = renderCard(baseVisit);
    fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
    expect(onArrive).toHaveBeenCalledWith(baseVisit);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('offers departure and an active marker for an in-progress visit', () => {
    const activeVisit = { ...baseVisit, status: 'in_progress' as const, check_in_at: baseVisit.scheduled_start };
    const { onArrive, onLeave } = renderCard(activeVisit);
    expect(screen.getByText('Active visit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledWith(activeVisit);
    expect(onArrive).not.toHaveBeenCalled();
  });
});
