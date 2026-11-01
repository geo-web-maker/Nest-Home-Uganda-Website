import { copy } from '../../copy';

/** Safe emergency text: no diagnoses, care details, client names or health data. */
export function buildSosSmsBody(now = new Date(), location?: { lat: number | null; lng: number | null }): string {
  const lines = [copy.safety.smsUrgent, `${copy.safety.smsTime} ${now.toISOString()}`];
  if (location?.lat != null && location.lng != null) {
    lines.push(`${copy.safety.smsLocation} https://maps.google.com/?q=${encodeURIComponent(`${location.lat},${location.lng}`)}`);
  }
  lines.push(copy.safety.smsPrepared);
  return lines.join('\n');
}

export function buildSosSmsHref(body: string): string {
  return `sms:?body=${encodeURIComponent(body)}`;
}
