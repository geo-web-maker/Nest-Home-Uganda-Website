import { describe, expect, it } from 'vitest';
import { needsLogoutConfirmation } from './logoutGuard';

describe('logout guard policy', () => {
  it('allows logout without a prompt when no local work is pending', () => {
    expect(needsLogoutConfirmation(0)).toBe(false);
  });

  it('requires confirmation for queued or needs-attention items', () => {
    expect(needsLogoutConfirmation(1)).toBe(true);
    expect(needsLogoutConfirmation(7)).toBe(true);
  });

  it('fails closed for invalid counts', () => {
    expect(needsLogoutConfirmation(Number.NaN)).toBe(false);
    expect(needsLogoutConfirmation(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
