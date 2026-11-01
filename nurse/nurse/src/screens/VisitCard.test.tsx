import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { VisitCard } from './VisitCard';

const baseVisit: CachedVisit = {
  id: 'visit-123', client_display_name: 'Test client', place_address_text: 'Test address',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'scheduled', instructions: 'Use front entrance', adhoc: false, updatedAt: '2026-10-25T08:00:00.000Z',
};

describe('visit card navigation contract', () => {
  it('renders the whole scheduled card as a single visit-detail link without embedded action buttons', () => {
    render(<MemoryRouter><VisitCard visit={baseVisit} photosEnabled onArrive={vi.fn()} onLeave={vi.fn()} onNote={vi.fn()} onPhoto={vi.fn()} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: /test client, scheduled/i });
    expect(link).toHaveAttribute('href', '/visit/visit-123');
    expect(link.querySelector('h3')).toHaveTextContent('Test client');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Test address')).toBeInTheDocument();
  });

  it('links active visits to the active workflow and shows the live elapsed time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(baseVisit.scheduled_start));
    const activeVisit = { ...baseVisit, status: 'in_progress' as const, check_in_at: baseVisit.scheduled_start };
    render(<MemoryRouter><VisitCard visit={activeVisit} photosEnabled onArrive={vi.fn()} onLeave={vi.fn()} onNote={vi.fn()} onPhoto={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /test client, in progress/i })).toHaveAttribute('href', '/active/visit-123');
    expect(document.querySelector('.mk-card--hot')).toBeInTheDocument();
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
