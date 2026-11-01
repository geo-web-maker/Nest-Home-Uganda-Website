import { webcrypto } from 'node:crypto';

/** jsdom has no WebCrypto; the mail store needs it, exactly as a real browser provides it. */
export function ensureWebCrypto(): void {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
