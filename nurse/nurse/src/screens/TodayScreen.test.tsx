import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { TodayScreen } from './TodayScreen';

const visit = (id: string, name: string, status: CachedVisit['status'], start: string): CachedVisit => ({
  id, client_display_name: name, place_address_text: '12 Kampala Road', scheduled_start: start,
  scheduled_end: '2026-10-25T12:00:00.000Z', status, instructions: 'Use the side entrance', adhoc: false,
  updatedAt: '2026-10-25T08:00:00.000Z', check_in_at: status === 'in_progress' ? start : null,
});
const baseProps = {
  visits: [], clients: [], adhocAllowed: false, adhocOpen: false, adhocClientId: '', photosEnabled: false,
  pendingPhotoCount: 0, loading: false, displayName: 'Amina Nakato', staffNumber: 'N-0098',
  onAdhocOpen: vi.fn(), onAdhocClient: vi.fn(), onStartAdhoc: vi.fn(), onSync: vi.fn(),
  onArrive: vi.fn(), onLeave: vi.fn(), onNote: vi.fn(), onPhoto: vi.fn(),
};

describe('Today screen reconstruction', () => {
  it('pins an active visit above an earlier scheduled visit', () => {
    const active = visit('active', 'Active client', 'in_progress', '2026-10-25T10:00:00.000Z');
    const scheduled = visit('scheduled', 'Scheduled client', 'scheduled', '2026-10-25T08:00:00.000Z');
    const { container } = render(<MemoryRouter><TodayScreen {...baseProps} visits={[scheduled, active]} /></MemoryRouter>);
    const names = [...container.querySelectorAll('.visit-card h3')].map((heading) => heading.textContent);
    expect(names).toEqual(['Active client', 'Scheduled client']);
    expect(screen.getByRole('heading', { name: /good .*amina/i })).toBeInTheDocument();
    expect(screen.getByText('Visit schedule')).toBeInTheDocument();
  });


  it('derives visit totals and the next scheduled Kampala time locally', () => {
    const complete = visit('done', 'Done client', 'completed', '2026-10-25T04:00:00.000Z');
    const next = visit('next', 'Next client', 'scheduled', '2026-10-25T08:00:00.000Z');
    const later = visit('later', 'Later client', 'scheduled', '2026-10-25T11:00:00.000Z');
    render(<MemoryRouter><TodayScreen {...baseProps} visits={[later, complete, next]} /></MemoryRouter>);
    expect(screen.getByText('Visit schedule')).toBeInTheDocument();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/11:00 · Next client/)).toBeInTheDocument();
  });

  it('omits the first name from the greeting when the cached profile has no name', () => {
    render(<MemoryRouter><TodayScreen {...baseProps} displayName={null} staffNumber="N-0098" /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Amina/);
    expect(screen.getByRole('img', { name: 'Profile initials 98' })).toBeInTheDocument();
  });

  it('embeds active visit detail with the required landmark, address, instructions and continue link', () => {
    const active = visit('active-1', 'Mary Kisakye', 'in_progress', '2026-10-25T08:00:00.000Z');
    render(<MemoryRouter><TodayScreen {...baseProps} visits={[active]} /></MemoryRouter>);
    const current = screen.getByRole('complementary', { name: 'Current visit' });
    expect(current).toHaveTextContent('Mary Kisakye');
    expect(current).toHaveTextContent('12 Kampala Road');
    expect(current).toHaveTextContent('Use the side entrance');
    expect(screen.getByRole('link', { name: /continue active visit/i })).toHaveAttribute('href', '/active/active-1');
  });

  it('keeps the summary and zero counts available for an empty schedule', () => {
    render(<MemoryRouter><TodayScreen {...baseProps} /></MemoryRouter>);
    expect(screen.getByText('No visits today.')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /today summary/i })).toHaveTextContent('0');
  });

  it('does not render unscheduled visit controls unless allowed and opens a client-only sheet when enabled', () => {
    const { rerender } = render(<MemoryRouter><TodayScreen {...baseProps} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /unscheduled visit/i })).toBeNull();
    rerender(<MemoryRouter><TodayScreen {...baseProps} adhocAllowed adhocOpen /></MemoryRouter>);
    expect(screen.getByRole('dialog', { name: /who did you visit/i })).toBeInTheDocument();
    expect(screen.getByText(/only clients currently assigned/i)).toBeInTheDocument();
  });
});
