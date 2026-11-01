import { nurseDb } from '../../offline/db';
import { CACHE_KEY_ID, DRAFTS_KEY_ID, destroyMailKey, openJson, sealJson } from './mailCrypto';

/**
 * Mail kept on this device lives in the same IndexedDB as the visit outbox (the `meta` table), so it follows the
 * app's other offline data: several drafts, restart recovery, and no separate localStorage copy of message text.
 */
export type MailDraftState = 'draft' | 'queued' | 'sending' | 'failed';

export type MailDraft = {
  id: string;
  /** The signed-in user the draft belongs to. Another person on the same device never sees it. */
  ownerId: string;
  mailboxId: string;
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  state: MailDraftState;
  /** Set once the server holds the draft, so a retry never creates a second one. */
  serverDraftId?: string;
  /** Files already attached to the server copy (shown only; they cannot be changed offline). */
  attachments?: { id: string; filename: string; size: number }[];
  savedAt: string;
};

export type CachedBox = { id: string; address: string; display_name: string; unread_count: number };
export type CachedMessage = {
  mailbox_message_id: string;
  message_id: string;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_text: string;
  origin: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
};
export type MailCache = { boxes: CachedBox[]; boxId: string; folder: string; messages: CachedMessage[] };

const DRAFTS_KEY = 'mail.drafts.v1';
const CACHE_KEY = 'mail.cache.v1';
/** Only the newest messages are kept for offline reading, with a capped body. */
export const CACHE_MESSAGE_LIMIT = 25;
export const CACHE_BODY_LIMIT = 2000;

/** Reads and decrypts the drafts of everyone who has used this device. Anything unreadable counts as no drafts. */
async function readAllDrafts(): Promise<MailDraft[]> {
  try {
    const row = await nurseDb.meta.get(DRAFTS_KEY);
    if (!row) return [];
    return (await openJson<MailDraft[]>(row.value, DRAFTS_KEY_ID)) ?? [];
  } catch {
    return [];
  }
}

let queue: Promise<unknown> = Promise.resolve();
/** One draft write at a time: in this tab by a queue, across tabs by a Web Lock where the browser has one. */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(
    (): Promise<T> => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request<Promise<T>>('nest-mail-drafts', work).then((result) => result) : work()),
  );
  queue = run.catch(() => undefined);
  return run;
}

async function changeDrafts(change: (drafts: MailDraft[]) => MailDraft[]): Promise<void> {
  await exclusive(async () => {
    const sealed = await sealJson(change(await readAllDrafts()), DRAFTS_KEY_ID);
    // Never fall back to plain text: a device that cannot encrypt keeps no drafts.
    if (!sealed) throw new Error('mail-store-unavailable');
    await nurseDb.meta.put({ key: DRAFTS_KEY, value: sealed });
  });
}

export async function listDrafts(ownerId: string): Promise<MailDraft[]> {
  if (!ownerId) return [];
  const all = await readAllDrafts();
  return all.filter((draft) => draft.ownerId === ownerId).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export async function putDraft(draft: MailDraft): Promise<void> {
  if (!draft.ownerId) throw new Error('mail-owner-required');
  await changeDrafts((all) => [...all.filter((item) => item.id !== draft.id), draft]);
}

export async function removeDraft(id: string): Promise<void> {
  await changeDrafts((all) => all.filter((item) => item.id !== id));
}

/** A send that was interrupted by closing the app goes back in the queue. */
export async function recoverInterruptedDrafts(ownerId: string): Promise<void> {
  if (!ownerId) return;
  await changeDrafts((all) => all.map((item) => (item.ownerId === ownerId && item.state === 'sending' ? { ...item, state: 'queued' } : item)));
}

/** Read from the encrypted copy; anything that cannot be decrypted counts as no cache. */
export async function readMailCache(): Promise<MailCache | null> {
  try {
    const row = await nurseDb.meta.get(CACHE_KEY);
    return row ? await openJson<MailCache>(row.value) : null;
  } catch {
    return null;
  }
}

export async function writeMailCache(cache: MailCache): Promise<void> {
  const trimmed: MailCache = {
    ...cache,
    messages: cache.messages.slice(0, CACHE_MESSAGE_LIMIT).map((message) => ({ ...message, body_text: message.body_text.slice(0, CACHE_BODY_LIMIT) })),
  };
  const sealed = await sealJson(trimmed);
  if (sealed) await nurseDb.meta.put({ key: CACHE_KEY, value: sealed });
}

/** Called at sign-out: removes the cache and deletes its key. Drafts stay (they are the person's own unsent work). */
export async function clearMailCache(): Promise<void> {
  await nurseDb.meta.delete(CACHE_KEY);
  await destroyMailKey(CACHE_KEY_ID);
}

/**
 * Called when a different person signs in on this device. Their drafts stay; everyone else's drafts are deleted, and the
 * read cache is cleared, so one nurse never sees or can send another nurse's unsent mail.
 */
export async function purgeOtherOwnersMail(currentOwnerId: string): Promise<void> {
  await clearMailCache();
  const all = await readAllDrafts();
  if (all.every((draft) => draft.ownerId === currentOwnerId)) return;
  await changeDrafts((drafts) => drafts.filter((draft) => draft.ownerId === currentOwnerId));
}
