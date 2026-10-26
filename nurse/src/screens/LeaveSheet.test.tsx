import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { LeaveSheet } from './LeaveSheet';

const visit: CachedVisit = {
  id: 'visit-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, check_in_at: '2026-10-25T08:00:00.000Z',
  updatedAt: '2026-10-25T08:00:00.000Z',
};
function renderSheet(canAddRequiredPhoto: boolean) {
  const onConfirm = vi.fn(); const onAddPhoto = vi.fn();
  render(<LeaveSheet visit={visit} finalNote="" busy={false} onFinalNote={vi.fn()} onConfirm={onConfirm} onCancel={vi.fn()} onAddPhoto={onAddPhoto} canAddRequiredPhoto={canAddRequiredPhoto} requiredPhotoMissing />);
  return { onConfirm, onAddPhoto };
}

describe('departure sheet safety requirements', () => {
  it('blocks departure while the required photo is missing and offers capture when allowed', () => {
    const { onConfirm, onAddPhoto } = renderSheet(true);
    expect((screen.getByRole('button', { name: /confirm departure/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /add required photo/i }));
    expect(onAddPhoto).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not offer an unavailable photo action when policy disables capture', () => {
    renderSheet(false);
    expect(screen.queryByRole('button', { name: /add required photo/i })).toBeNull();
    expect(screen.getByText(/contact your supervisor/i)).toBeTruthy();
  });
});
