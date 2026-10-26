import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxOperation } from '../offline/db';
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

  it('does not offer apply-again for a visit that is no longer assigned', () => {
    renderSync([operation('removed-item', 'nurse-a', 'needs_attention', 'visit_not_assigned')]);
    expect(screen.queryByRole('button', { name: /apply again as new action/i })).toBeNull();
  });

  it('does not offer apply-again for a malformed payload that must be corrected first', () => {
    renderSync([operation('invalid-item', 'nurse-a', 'needs_attention', 'invalid_payload')]);
    expect(screen.queryByRole('button', { name: /apply again as new action/i })).toBeNull();
  });
});
