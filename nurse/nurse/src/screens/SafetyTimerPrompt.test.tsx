import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { SafetyTimerPrompt } from './SafetyTimerPrompt';

const visit: CachedVisit = {
  id: 'visit-safety-0001', client_display_name: 'Assigned client', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, check_in_at: '2026-10-25T08:00:00.000Z',
  safety_timer_until: '2026-10-25T09:15:00.000Z', safety_state: 'armed', updatedAt: '2026-10-25T08:00:00.000Z',
};

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('safety timer deadline prompt', () => {
  it('explains that dismissing the prompt does not confirm safety', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    render(<SafetyTimerPrompt visit={{ ...visit, safety_timer_sync_state: 'confirmed' }} onOpenVisit={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/does not confirm that you are safe/i)).toBeTruthy();
  });

  it('does not claim server monitoring when the local timer has not synced', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    render(<SafetyTimerPrompt visit={{ ...visit, safety_timer_sync_state: 'pending_sync' }} onOpenVisit={vi.fn()} />);
    expect(screen.getByText(/has not confirmed that the server is monitoring this timer/i)).toBeTruthy();
  });

  it('dismisses only the local reminder, without invoking the visit-open callback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    const onOpenVisit = vi.fn();
    render(<SafetyTimerPrompt visit={visit} onOpenVisit={onOpenVisit} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss reminder only/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onOpenVisit).not.toHaveBeenCalled();
  });
});
