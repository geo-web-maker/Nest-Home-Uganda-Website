import { useState, type FormEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedVisit, LocalPhoto } from '../offline/db';
import { PhotoSheet, type PhotoType } from './PhotoSheet';

const visit: CachedVisit = {
  id: 'visit-photo-1', client_display_name: 'Client One', place_address_text: '',
  scheduled_start: '2026-10-25T08:00:00.000Z', scheduled_end: '2026-10-25T09:00:00.000Z',
  status: 'in_progress', instructions: '', adhoc: false, photo_rules: { allowed: true }, updatedAt: '2026-10-25T08:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:test-photo') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); });

function PhotoSheetHarness({ onSubmit = vi.fn((event: FormEvent, _type: PhotoType) => event.preventDefault()), photosEnabled = true }: { onSubmit?: (event: FormEvent, photoType: PhotoType) => void; photosEnabled?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  return <PhotoSheet visit={visit} file={file} onFile={setFile} onSubmit={onSubmit} onCancel={vi.fn()} pendingPhotos={[]} pendingCount={0} photosEnabled={photosEnabled} guidanceText="Keep client information out of frame." wifiOnly onWifiOnly={vi.fn()} />;
}

describe('photo capture sheet', () => {
  it('warns above the pending-photo threshold and exposes the Wi-Fi-only preference', () => {
    const onWifiOnly = vi.fn();
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[]} pendingCount={21} wifiOnly onWifiOnly={onWifiOnly} />);
    expect(screen.getByRole('status').textContent).toMatch(/more than 20 photos/i);
    const toggle = screen.getByRole('checkbox', { name: /upload only when wi-fi is confirmed/i });
    fireEvent.click(toggle);
    expect(onWifiOnly).toHaveBeenCalledWith(false);
  });

  it('requires a selected file before enabling save', () => {
    render(<PhotoSheetHarness />);
    expect((screen.getByRole('button', { name: /save photo for upload/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Keep client information out of frame.')).toBeTruthy();
  });

  it('records that photo guidance was acknowledged for the current local day', () => {
    render(<PhotoSheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: /i have read the guidance/i }));
    expect(screen.queryByText('Keep client information out of frame.')).toBeNull();
    expect(screen.getByLabelText(/choose or take a photo/i)).toBeTruthy();
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it('does not expose capture or upload controls when photo proof is disabled', () => {
    render(<PhotoSheetHarness photosEnabled={false} />);
    expect(screen.getByText(/photos are switched off/i)).toBeTruthy();
    expect(screen.queryByLabelText(/choose or take a photo/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /save photo for upload/i })).toBeNull();
  });


  it('requires confirmation before deleting an unuploaded local photo', () => {
    const photo: LocalPhoto = {
      id: 'local-photo-1', visitId: visit.id, ownerUserId: 'nurse-1', blob: new Blob(['photo']),
      mime: 'image/jpeg', photoType: 'arrival', createdAt: '2026-10-25T08:10:00.000Z',
      uploadStage: 'pending_upload', state: 'needs_attention', attempts: 1,
    };
    const onDiscardLocalPhoto = vi.fn();
    const onRetakeLocalPhoto = vi.fn();
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[photo]} pendingCount={1} onDiscardLocalPhoto={onDiscardLocalPhoto} onRetakeLocalPhoto={onRetakeLocalPhoto} wifiOnly onWifiOnly={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /delete saved photo/i }));
    expect(onDiscardLocalPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /delete local image/i }));
    expect(onDiscardLocalPhoto).toHaveBeenCalledWith('local-photo-1');
    expect(onRetakeLocalPhoto).not.toHaveBeenCalled();
  });

  it('requires confirmation before replacing an unuploaded local photo', () => {
    const photo: LocalPhoto = {
      id: 'local-photo-retake', visitId: visit.id, ownerUserId: 'nurse-1', blob: new Blob(['photo']),
      mime: 'image/jpeg', photoType: 'other', createdAt: '2026-10-25T08:10:00.000Z',
      uploadStage: 'pending_upload', state: 'queued', attempts: 0,
    };
    const onDiscardLocalPhoto = vi.fn();
    const onRetakeLocalPhoto = vi.fn();
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[photo]} pendingCount={1} onDiscardLocalPhoto={onDiscardLocalPhoto} onRetakeLocalPhoto={onRetakeLocalPhoto} wifiOnly onWifiOnly={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /retake photo/i }));
    expect(onRetakeLocalPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /remove and retake/i }));
    expect(onRetakeLocalPhoto).toHaveBeenCalledWith('local-photo-retake');
    expect(onDiscardLocalPhoto).not.toHaveBeenCalled();
  });

  it('does not offer local deletion or retake after the remote transfer stage', () => {
    const photo: LocalPhoto = {
      id: 'local-photo-uploaded', visitId: visit.id, ownerUserId: 'nurse-1', blob: new Blob(['photo']),
      mime: 'image/jpeg', photoType: 'departure', createdAt: '2026-10-25T08:10:00.000Z',
      uploadStage: 'uploaded', state: 'needs_attention', attempts: 1,
    };
    render(<PhotoSheet visit={visit} file={null} onFile={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} pendingPhotos={[photo]} pendingCount={1} onDiscardLocalPhoto={vi.fn()} onRetakeLocalPhoto={vi.fn()} wifiOnly onWifiOnly={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete saved photo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retake photo/i })).toBeNull();
    expect(screen.getByText(/uploaded; registration pending/i)).toBeTruthy();
  });

  it('submits the selected evidence type only after a photo is previewed', () => {
    const onSubmit = vi.fn((event: FormEvent, _type: PhotoType) => event.preventDefault());
    render(<PhotoSheetHarness onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/choose or take a photo/i);
    fireEvent.change(input, { target: { files: [new File(['image-bytes'], 'arrival.jpg', { type: 'image/jpeg' })] } });
    const typeSelect = screen.getByLabelText(/photo type/i);
    fireEvent.change(typeSelect, { target: { value: 'arrival' } });
    fireEvent.click(screen.getByRole('button', { name: /save photo for upload/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toBe('arrival');
  });
});
