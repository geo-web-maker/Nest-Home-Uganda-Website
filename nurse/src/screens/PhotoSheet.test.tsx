import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CachedVisit } from '../offline/db';
import { PhotoSheet } from './PhotoSheet';

const visit: CachedVisit = {
  id: 'visit-photo-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, photo_rules: { allowed: true }, updatedAt: '2026-10-25T08:00:00.000Z',
};

describe('photo capture sheet', () => {
  it('warns above the pending-photo threshold and exposes the Wi-Fi-only preference', () => {
    const onWifiOnly = vi.fn();
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[]} pendingCount={21} wifiOnly onWifiOnly={onWifiOnly} />);
    expect(screen.getByRole('status').textContent).toMatch(/more than 20 photos/i);
    const toggle = screen.getByRole('checkbox', { name: /upload only when wi-fi is confirmed/i });
    fireEvent.click(toggle);
    expect(onWifiOnly).toHaveBeenCalledWith(false);
  });

  it('does not allow a save until a file is selected', () => {
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[]} pendingCount={0} wifiOnly={false} onWifiOnly={vi.fn()} />);
    expect((screen.getByRole('button', { name: /save photo for upload/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
