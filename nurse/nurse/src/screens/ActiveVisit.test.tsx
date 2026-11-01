import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { ActiveVisit } from './ActiveVisit';

const visit: CachedVisit = {
  id: 'active-visit-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T11:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, check_in_at: '2026-10-25T09:00:00.000Z',
  photo_rules: { allowed: true }, photo_count: 2, verification_label: 'Verified',
  updatedAt: '2026-10-25T09:00:00.000Z',
};

afterEach(() => vi.useRealTimers());

describe('active visit screen', () => {
  it('derives elapsed time from the persisted check-in timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    render(<MemoryRouter><ActiveVisit visit={visit} onNote={vi.fn()} onPhoto={vi.fn()} onLeave={vi.fn()} photosEnabled /></MemoryRouter>);
    expect(screen.getByText('01:00:00')).toBeTruthy();
    expect(screen.getByText('Photos (2 of 5)')).toBeTruthy();
  });


  it('hides the photo surface when the visit or organisation disallows photos', () => {
    const restricted = { ...visit, photo_rules: { allowed: false } };
    render(<MemoryRouter><ActiveVisit visit={restricted} onNote={vi.fn()} onPhoto={vi.fn()} onLeave={vi.fn()} photosEnabled /></MemoryRouter>);
    expect(screen.queryByText(/Photos \(/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('shows the server deadline for an active safety timer in Kampala time', () => {
    const safetyVisit = { ...visit, safety_timer_until: '2026-10-25T08:30:00.000Z' };
    render(<MemoryRouter><ActiveVisit visit={safetyVisit} onNote={vi.fn()} onPhoto={vi.fn()} onLeave={vi.fn()} photosEnabled /></MemoryRouter>);
    expect(screen.getByText(/Safety timer · 11:30/)).toBeInTheDocument();
  });

  it('routes the visual quick-note and photo controls through existing callbacks', () => {
    const onNote = vi.fn(); const onPhoto = vi.fn(); const onLeave = vi.fn();
    render(<MemoryRouter><ActiveVisit visit={visit} onNote={onNote} onPhoto={onPhoto} onLeave={onLeave} photosEnabled /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /write a short operational note/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: /leave/i }));
    expect(onNote).toHaveBeenCalledWith(visit);
    expect(onPhoto).toHaveBeenCalledWith(visit);
    expect(onLeave).toHaveBeenCalledWith(visit);
  });
});
