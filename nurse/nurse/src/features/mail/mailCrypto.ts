/**
 * Encrypts the offline mail cache. The AES-GCM key is created on this device as non-extractable and kept in its own
 * IndexedDB database, so the stored text cannot be read without it. Signing out deletes that database, which makes any
 * cache left behind unreadable. If the browser has no WebCrypto (an insecure page), nothing is cached at all.
 */
const KEY_DB = 'nest-mail-key';
const STORE = 'keys';
/** The offline read cache is sealed with one key, unsent drafts with another, so each can be destroyed on its own. */
export const CACHE_KEY_ID = 'cache-v1';
export const DRAFTS_KEY_ID = 'drafts-v1';

type Sealed = { v: 1; iv: string; data: string };

const subtle = (): SubtleCrypto | null => globalThis.crypto?.subtle ?? null;

const toBase64 = (bytes: Uint8Array): string => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readKey(db: IDBDatabase, keyId: string): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(keyId);
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeKey(db: IDBDatabase, keyId: string, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, keyId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadKey(create: boolean, keyId: string): Promise<CryptoKey | null> {
  const crypto = subtle();
  if (!crypto) return null;
  const db = await openKeyDb();
  try {
    const existing = await readKey(db, keyId);
    if (existing || !create) return existing;
    const key = await crypto.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await writeKey(db, keyId, key);
    return key;
  } finally {
    db.close();
  }
}

/** Returns the sealed text to store, or null when encryption is not possible (store nothing then). */
export async function sealJson(value: unknown, keyId: string = CACHE_KEY_ID): Promise<string | null> {
  try {
    const crypto = subtle();
    const key = await loadKey(true, keyId);
    if (!crypto || !key) return null;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))));
    return JSON.stringify({ v: 1, iv: toBase64(iv), data: toBase64(data) } satisfies Sealed);
  } catch {
    return null;
  }
}

/** Returns null for anything that cannot be read: no key, wrong key, damaged or edited text. */
export async function openJson<T>(sealed: string, keyId: string = CACHE_KEY_ID): Promise<T | null> {
  try {
    const crypto = subtle();
    const key = await loadKey(false, keyId);
    if (!crypto || !key) return null;
    const parsed = JSON.parse(sealed) as Sealed;
    if (parsed.v !== 1) return null;
    const plain = await crypto.decrypt({ name: 'AES-GCM', iv: fromBase64(parsed.iv) as BufferSource }, key, fromBase64(parsed.data) as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

/** Deletes one named key (anything sealed with it becomes unreadable), or every key when no name is given. */
export async function destroyMailKey(keyId?: string): Promise<void> {
  if (!keyId) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(KEY_DB);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    return;
  }
  let db: IDBDatabase;
  try {
    db = await openKeyDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(keyId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
