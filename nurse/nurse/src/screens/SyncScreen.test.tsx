import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LocalPhoto, OutboxOperation } from '../offline/db';
import { SyncScreen } from './SyncScreen';

function operation(id: string, ownerUserId: string, state: OutboxOperation['state'] = 'needs_attention', lastError?: string): OutboxOperation {
  return { id, kind: 'check_in', visitId: 'visit-1', ownerUserId, payload: {}, createdAt: '2026-10-25T10:00:00.000Z', state, attempts: 1, lastError };
}

function renderSync(operations: OutboxOperation[], onDiscard = vi.fn()) {
  return { onDiscard, ...render(<SyncScreen
    operations={operations} photos={[]} userId="nurse-a" online busy={false} wifiOnly={false}
    onSync={vi.fn()} onRetry={vi.fn()} onDiscard={onDiscard} onApplyAgain={vi.fn()}
    onRetryPhoto={vi.fn()} onUploadPhotoNow={vi.fn()} onDiscardPhoto={vi.fn()}
  />) };
}

describe('sync status screen', () => {
  it('shows only queue items owned by the signed-in nurse', () => {
    renderSync([operation('own-item', 'nurse-a'), operation('other-item', 'nurse-b')]);
    expect(screen.getByText(/Reference: own-item/)).toBeTruthy();
    expect(screen.queryByText(/Reference: other-item/)).toBeNull();
  });

  it('requires explicit confirmation before discarding a saved action', () => {
    const onDiscard = vi.fn();
    renderSync([operation('own-item', 'nurse-a')], onDiscard);
    fireEvent.click(screen.getByRole('button', { name: /discard saved action/i }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm discard/i }));
    expect(onDiscard).toHaveBeenCalledWith('own-item');
  });

  it('does not allow discarding a photo whose remote upload awaits registration', () => {
    const photo: LocalPhoto = {
      id: 'photo-uploaded-pending', visitId: 'visit-1', ownerUserId: 'nurse-a', blob: new Blob(['image']),
      mime: 'image/jpeg', createdAt: '2026-10-25T10:00:00.000Z', uploadStage: 'uploaded',
      state: 'needs_attention', attempts: 1, lastError: 'Registration was not confirmed',
    };
    const onDiscardPhoto = vi.fn();
    render(<SyncScreen operations={[]} photos={[photo]} userId="nurse-a" online busy={false} wifiOnly={false} onSync={vi.fn()} onRetry={vi.fn()} onDiscard={vi.fn()} onApplyAgain={vi.fn()} onRetryPhoto={vi.fn()} onUploadPhotoNow={vi.fn()} onDiscardPhoto={onDiscardPhoto} />);
    const discard = screen.getByRole('button', { name: /discard saved photo/i }) as HTMLButtonElement;
    expect(discard.disabled).toBe(true);
    expect(onDiscardPhoto).not.toHaveBeenCalled();
  });

  it('does not offer apply-again for a visit that is no longer assigned', () => {
    renderSync([operation('removed-item', 'nurse-a', 'needs_attention', 'visit_not_assigned')]);
    expect(screen.queryByRole('button', { name: /apply again as new action/i })).toBeNull();
  });

  it('does not offer apply-again for a malformed payload that must be corrected first', () => {
    renderSync([operation('invalid-item', 'nurse-a', 'needs_attention', 'invalid_payload')]);
    expect(screen.queryByRole('button', { name: /apply again as new action/i })).toBeNull();
  });
});
