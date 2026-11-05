import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { nurseDb } from '../../offline/db';
import { destroyMailKey } from './mailCrypto';
import { ensureWebCrypto } from './testSupport';
import { CACHE_BODY_LIMIT, CACHE_MESSAGE_LIMIT, clearMailCache, listDrafts, purgeOtherOwnersMail, putDraft, readMailCache, recoverInterruptedDrafts, removeDraft, writeMailCache, type MailDraft } from './mailStore';

const draft = (id: string, extra: Partial<MailDraft> = {}): MailDraft => ({ id, ownerId: 'u1', mailboxId: 'b1', to: ['a@x.test'], subject: id, body: 'hi', state: 'draft', savedAt: `2026-10-31T10:00:0${id.length}Z`, ...extra });

beforeAll(ensureWebCrypto);
afterEach(async () => { await nurseDb.meta.clear(); await destroyMailKey(); });

describe('mail drafts on the device', () => {
  it('keeps several drafts at once instead of one shared slot', async () => {
    await putDraft(draft('a'));
    await putDraft(draft('bb', { state: 'queued' }));
    await putDraft(draft('a', { subject: 'changed' }));
    const all = await listDrafts('u1');
    expect(all.map((item) => item.id)).toEqual(['a', 'bb']);
    expect(all.find((item) => item.id === 'a')?.subject).toBe('changed');
    expect(all.find((item) => item.id === 'bb')?.state).toBe('queued');
  });
  it('shows a draft only to the person who wrote it', async () => {
    await putDraft(draft('a'));
    await putDraft(draft('b2', { ownerId: 'u2' }));
    expect((await listDrafts('u1')).map((item) => item.id)).toEqual(['a']);
    expect((await listDrafts('u2')).map((item) => item.id)).toEqual(['b2']);
  });
  it('removes one draft and leaves the rest', async () => {
    await putDraft(draft('a'));
    await putDraft(draft('bb'));
    await removeDraft('a');
    expect((await listDrafts('u1')).map((item) => item.id)).toEqual(['bb']);
  });
  it('puts an interrupted send back in the queue and keeps the server draft id', async () => {
    await putDraft(draft('a', { state: 'sending', serverDraftId: 'srv-1' }));
    await putDraft(draft('bb', { state: 'failed' }));
    await putDraft(draft('c3', { state: 'sending', ownerId: 'u2' }));
    await recoverInterruptedDrafts('u1');
    const mine = await listDrafts('u1');
    expect(mine.find((item) => item.id === 'a')).toMatchObject({ state: 'queued', serverDraftId: 'srv-1' });
    expect(mine.find((item) => item.id === 'bb')?.state).toBe('failed');
    expect((await listDrafts('u2'))[0]?.state).toBe('sending');
  });
});

describe('drafts are private to their owner', () => {
  it('are encrypted at rest, so no subject or address is readable in IndexedDB', async () => {
    await putDraft(draft('a', { subject: 'Client Nakato fall report', to: ['supervisor@mail.test'] }));
    const raw = await nurseDb.meta.get('mail.drafts.v1');
    expect(raw?.value).toBeTruthy();
    expect(raw?.value).not.toContain('Nakato');
    expect(raw?.value).not.toContain('supervisor@mail.test');
    expect((await listDrafts('u1'))[0]?.subject).toBe('Client Nakato fall report');
  });

  it('are refused when there is no signed-in owner, and never listed for one', async () => {
    await expect(putDraft(draft('a', { ownerId: '' }))).rejects.toThrow('mail-owner-required');
    await putDraft(draft('b2'));
    expect(await listDrafts('')).toEqual([]);
  });

  it("are deleted when a different person signs in, while that person's own drafts stay", async () => {
    await putDraft(draft('a', { ownerId: 'nurse-a', subject: 'A private' }));
    await putDraft(draft('b2', { ownerId: 'nurse-b', subject: 'B own' }));
    await writeMailCache({ boxes: [], boxId: 'x', folder: 'inbox', messages: [] });
    await purgeOtherOwnersMail('nurse-b');
    expect(await listDrafts('nurse-a')).toEqual([]);
    expect((await listDrafts('nurse-b')).map((d) => d.subject)).toEqual(['B own']);
    expect(await readMailCache()).toBeNull();
  });

  it('survive the same person signing back in', async () => {
    await putDraft(draft('a', { ownerId: 'nurse-a' }));
    await purgeOtherOwnersMail('nurse-a');
    expect(await listDrafts('nurse-a')).toHaveLength(1);
  });

  it('are gone for good once the device key is destroyed, even if the stored text remains', async () => {
    await putDraft(draft('a', { ownerId: 'nurse-a' }));
    await destroyMailKey();
    expect(await listDrafts('nurse-a')).toEqual([]);
  });

  it('do not lose writes made at the same moment', async () => {
    await Promise.all(['a', 'bb', 'c3', 'd44', 'e555'].map((id) => putDraft(draft(id))));
    expect(await listDrafts('u1')).toHaveLength(5);
  });

  it('are not written in plain text when the browser cannot encrypt', async () => {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      await expect(putDraft(draft('a'))).rejects.toThrow('mail-store-unavailable');
      expect(await nurseDb.meta.get('mail.drafts.v1')).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});

describe('mail read cache', () => {
  const message = (n: number, body = 'x') => ({ mailbox_message_id: `m${n}`, message_id: `g${n}`, from_address: 'a@x.test', subject: `s${n}`, body_text: body, origin: 'internal', received_at: '2026-10-31T10:00:00Z', is_read: true, is_starred: false });
  it('keeps only the newest messages and caps each body', async () => {
    const messages = Array.from({ length: CACHE_MESSAGE_LIMIT + 5 }, (_, n) => message(n, 'y'.repeat(CACHE_BODY_LIMIT + 500)));
    await writeMailCache({ boxes: [], boxId: 'b1', folder: 'inbox', messages });
    const cached = await readMailCache();
    expect(cached?.messages).toHaveLength(CACHE_MESSAGE_LIMIT);
    expect(cached?.messages[0]?.body_text).toHaveLength(CACHE_BODY_LIMIT);
  });
  it('is wiped at sign-out without touching unsent drafts', async () => {
    await writeMailCache({ boxes: [], boxId: 'b1', folder: 'inbox', messages: [message(1)] });
    await putDraft(draft('a'));
    await clearMailCache();
    expect(await readMailCache()).toBeNull();
    expect(await listDrafts('u1')).toHaveLength(1);
  });
  it('stores the cache encrypted, so no message text sits readable in IndexedDB', async () => {
    await writeMailCache({ boxes: [], boxId: 'b1', folder: 'inbox', messages: [message(1, 'Client Nakato had a fall')] });
    const raw = await nurseDb.meta.get('mail.cache.v1');
    expect(raw?.value).toBeTruthy();
    expect(raw?.value).not.toContain('Nakato');
    expect(raw?.value).not.toContain('"s1"'); // quoted: a bare 's1' can occur by chance in base64 ciphertext
    expect((await readMailCache())?.messages[0]?.body_text).toBe('Client Nakato had a fall');
  });
  it('is unreadable after sign-out even if the stored text is put back', async () => {
    await writeMailCache({ boxes: [], boxId: 'b1', folder: 'inbox', messages: [message(1)] });
    const raw = (await nurseDb.meta.get('mail.cache.v1'))?.value as string;
    await clearMailCache();
    await nurseDb.meta.put({ key: 'mail.cache.v1', value: raw });
    expect(await readMailCache()).toBeNull();
  });
  it('returns null when nothing was saved', async () => {
    expect(await readMailCache()).toBeNull();
  });
});
