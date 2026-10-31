import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CACHE_KEY_ID, DRAFTS_KEY_ID, destroyMailKey, openJson, sealJson } from './mailCrypto';
import { ensureWebCrypto } from './testSupport';

beforeAll(ensureWebCrypto);
afterEach(async () => { vi.unstubAllGlobals(); await destroyMailKey(); });

describe('mail cache encryption', () => {
  it('round-trips a value and never stores it in the clear', async () => {
    const sealed = await sealJson({ subject: 'Client Nakato fall report', n: 3 });
    expect(sealed).not.toBeNull();
    expect(sealed).not.toContain('Nakato');
    expect(await openJson<{ subject: string; n: number }>(sealed as string)).toEqual({ subject: 'Client Nakato fall report', n: 3 });
  });

  it('uses a fresh nonce each time, so equal values look different', async () => {
    const a = await sealJson({ same: true });
    const b = await sealJson({ same: true });
    expect(a).not.toBe(b);
  });

  it('refuses text that was edited', async () => {
    const sealed = JSON.parse((await sealJson({ a: 1 })) as string) as { v: number; iv: string; data: string };
    const flipped = { ...sealed, data: `${sealed.data.slice(0, -4)}AAAA` };
    expect(await openJson(JSON.stringify(flipped))).toBeNull();
    expect(await openJson('not json')).toBeNull();
  });

  it('cannot open anything once the key is destroyed (sign-out)', async () => {
    const sealed = (await sealJson({ secret: 'x' })) as string;
    await destroyMailKey();
    expect(await openJson(sealed)).toBeNull();
  });

  it('does not create a key just to read', async () => {
    expect(await openJson(JSON.stringify({ v: 1, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' }))).toBeNull();
  });

  it('stores nothing when the browser has no WebCrypto', async () => {
    vi.stubGlobal('crypto', {});
    expect(await sealJson({ a: 1 })).toBeNull();
    expect(await openJson('{"v":1,"iv":"","data":""}')).toBeNull();
  });

  it('keeps the cache key and the drafts key separate', async () => {
    const draftText = (await sealJson({ d: 1 }, DRAFTS_KEY_ID)) as string;
    expect(await openJson(draftText)).toBeNull();
    expect(await openJson(draftText, DRAFTS_KEY_ID)).toEqual({ d: 1 });
  });

  it('destroys one key without touching the other', async () => {
    const cache = (await sealJson({ c: 1 }, CACHE_KEY_ID)) as string;
    const drafts = (await sealJson({ d: 1 }, DRAFTS_KEY_ID)) as string;
    await destroyMailKey(CACHE_KEY_ID);
    expect(await openJson(cache, CACHE_KEY_ID)).toBeNull();
    expect(await openJson(drafts, DRAFTS_KEY_ID)).toEqual({ d: 1 });
  });
});
