import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from './webauthn';

describe('webauthn base64url helpers', () => {
  it('round-trips arbitrary bytes without padding or unsafe characters', () => {
    const original = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    const encoded = bytesToBase64Url(original.buffer);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(original));
  });

  it('decodes values whose padding was stripped', () => {
    expect(Array.from(base64UrlToBytes('YQ'))).toEqual([97]);
  });
});
