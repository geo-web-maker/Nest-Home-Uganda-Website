/** Evidence helpers for signing. Secrets never leave the device in clear: passphrases are salted and hashed here. */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b instanceof Uint8Array ? b : b), (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function passphraseEvidence(passphrase: string): Promise<Record<string, unknown>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const input = new Uint8Array([...salt, ...enc.encode(passphrase)]);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return { passphrase_sha256: hex(digest), salt: hex(salt), kdf: 'sha256+salt', at: new Date().toISOString() };
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    const pk = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    return Boolean(pk?.isUserVerifyingPlatformAuthenticatorAvailable && await pk.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

/** Asks the phone for fingerprint, face or screen lock. Only a confirmation is recorded; the biometric never leaves the device. */
export async function biometricEvidence(label: string, documentRef: string): Promise<Record<string, unknown>> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({ publicKey: {
    challenge, rp: { name: 'Bloomwell Home Care' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label, displayName: label },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60_000,
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Device verification was cancelled.');
  return { credential_id: b64(cred.rawId), user_verification: 'required', authenticator: 'platform', document_ref: documentRef, at: new Date().toISOString() };
}
