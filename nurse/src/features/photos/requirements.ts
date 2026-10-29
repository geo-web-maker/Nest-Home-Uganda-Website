export type PhotoRequirementMode = 'none' | 'arrival' | 'departure' | 'either' | 'both';
export type PhotoEvidenceType = 'arrival' | 'departure' | 'other';

/** True until the current visit has all photo types required by its effective policy. */
export function checkoutPhotoRequirementMissing(mode: PhotoRequirementMode, photoTypes: readonly PhotoEvidenceType[]): boolean {
  const available = new Set(photoTypes);
  switch (mode) {
    case 'none': return false;
    case 'arrival': return !available.has('arrival');
    case 'departure': return !available.has('departure');
    case 'either': return !available.has('arrival') && !available.has('departure');
    case 'both': return !available.has('arrival') || !available.has('departure');
    default: return true; // Unknown policy values fail closed.
  }
}
