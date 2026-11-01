import { describe, expect, it } from 'vitest';
import { buildSosSmsBody, buildSosSmsHref } from './sosMessage';

describe('SOS SMS composer fallback', () => {
  it('contains a timestamp and optional map link without health details', () => {
    const body = buildSosSmsBody(new Date('2026-10-25T10:00:00.000Z'), { lat: 0.31, lng: 32.58 });
    expect(body).toContain('Time: 2026-10-25T10:00:00.000Z');
    expect(body).toContain('maps.google.com');
    expect(body).not.toMatch(/diagnosis|medical|patient|condition|medication|symptom/i);
  });
  it('opens a message composer rather than sending a message automatically', () => {
    expect(buildSosSmsHref('I need help')).toBe('sms:?body=I%20need%20help');
  });
});
