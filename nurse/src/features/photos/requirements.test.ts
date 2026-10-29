import { describe, expect, it } from 'vitest';
import { checkoutPhotoRequirementMissing } from './requirements';

describe('photo evidence policy for checkout', () => {
  it('never blocks when photo evidence is optional', () => {
    expect(checkoutPhotoRequirementMissing('none', [])).toBe(false);
    expect(checkoutPhotoRequirementMissing('none', ['other'])).toBe(false);
  });

  it('requires the configured arrival or departure type, not an unrelated photo', () => {
    expect(checkoutPhotoRequirementMissing('arrival', ['other', 'departure'])).toBe(true);
    expect(checkoutPhotoRequirementMissing('arrival', ['arrival'])).toBe(false);
    expect(checkoutPhotoRequirementMissing('departure', ['other', 'arrival'])).toBe(true);
    expect(checkoutPhotoRequirementMissing('departure', ['departure'])).toBe(false);
  });

  it('distinguishes either from both', () => {
    expect(checkoutPhotoRequirementMissing('either', ['other'])).toBe(true);
    expect(checkoutPhotoRequirementMissing('either', ['arrival'])).toBe(false);
    expect(checkoutPhotoRequirementMissing('either', ['departure'])).toBe(false);
    expect(checkoutPhotoRequirementMissing('both', ['arrival'])).toBe(true);
    expect(checkoutPhotoRequirementMissing('both', ['departure'])).toBe(true);
    expect(checkoutPhotoRequirementMissing('both', ['arrival', 'departure'])).toBe(false);
  });
});
