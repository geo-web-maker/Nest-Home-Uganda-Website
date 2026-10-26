import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { TodayScreen } from './TodayScreen';

const visit = (id: string, name: string, status: CachedVisit['status'], start: string): CachedVisit => ({
  id, client_display_name: name, place_address_text: '', scheduled_start: start,
  scheduled_end: '2026-10-25T12:00:00.000Z', status, instructions: '', adhoc: false,
  updatedAt: '2026-10-25T08:00:00.000Z',
});
const baseProps = {
  visits: [], clients: [], adhocAllowed: false, adhocOpen: false, adhocClientId: '', photosEnabled: false,
  pendingPhotoCount: 0, loading: false, onAdhocOpen: vi.fn(), onAdhocClient: vi.fn(),
  onStartAdhoc: vi.fn(), onSync: vi.fn(), onArrive: vi.fn(), onLeave: vi.fn(), onNote: vi.fn(), onPhoto: vi.fn(),
};

describe('Today screen', () => {
  it('pins an active visit above an earlier scheduled visit', () => {
    const active = visit('active', 'Active client', 'in_progress', '2026-10-25T10:00:00.000Z');
    const scheduled = visit('scheduled', 'Scheduled client', 'scheduled', '2026-10-25T08:00:00.000Z');
    const { container } = render(<MemoryRouter><TodayScreen {...baseProps} visits={[scheduled, active]} /></MemoryRouter>);
    const names = [...container.querySelectorAll('.visit-card h3')].map((heading) => heading.textContent);
    expect(names).toEqual(['Active client', 'Scheduled client']);
  });

  it('does not render unscheduled visit controls unless allowed', () => {
    const { rerender } = render(<MemoryRouter><TodayScreen {...baseProps} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /unscheduled visit/i })).toBeNull();
    rerender(<MemoryRouter><TodayScreen {...baseProps} adhocAllowed /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /unscheduled visit/i })).toBeTruthy();
  });
});
