import { fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { NoteSheet } from './NoteSheet';

const visit: CachedVisit = {
  id: 'visit-note-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, updatedAt: '2026-10-25T08:00:00.000Z',
};

describe('operational visit notes', () => {
  it('explains the privacy boundary and prevents empty submissions', () => {
    render(<NoteSheet visit={visit} value="" onChange={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/do not enter medical details/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('passes note edits to the parent-owned local save flow', () => {
    const onChange = vi.fn(); const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(<NoteSheet visit={visit} value="Arrived at gate" onChange={onChange} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Visit note'), { target: { value: 'Gate opened' } });
    expect(onChange).toHaveBeenCalledWith('Gate opened');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
