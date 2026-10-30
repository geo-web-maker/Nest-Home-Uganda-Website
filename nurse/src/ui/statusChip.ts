import { copy, visitStatusLabel } from '../copy';
import type { ChipKind } from './Chip';
export function statusKind(status: string, verification?: string | null, pending = false): ChipKind {
  if (pending || verification === 'pending_sync') return 'pd';
  if (verification === 'verified' || status === 'completed') return 'ok';
  if (verification === 'needs_review' || ['cancelled', 'missed', 'needs_attention'].includes(status)) return 'rv';
  if (status === 'in_progress') return 'pg';
  if (status === 'scheduled') return 'sc';
  return 'pd';
}
export function statusText(status: string, verification?: string | null, pending = false): string {
  if (pending || verification === 'pending_sync') return copy.history.pendingSync;
  if (verification === 'verified') return copy.history.verified;
  if (verification === 'needs_review') return copy.history.needsReview;
  return visitStatusLabel(status);
}
