/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
/**
 * Browser side of device-biometric signing (WebAuthn).
 *
 * The phone's OS shows the Face ID / fingerprint / screen-lock prompt; the page never sees
 * the biometric, only a signed response that the server verifies against a challenge tied
 * to the exact agreement version.
 */

export type PasskeyCreationOptions = {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout?: number;
  excludeCredentials?: Array<{ id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }>;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
};

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True only when this device can verify the user with a built-in biometric or screen lock. */
export async function passkeysSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export class PasskeyError extends Error {}

/** Show the device prompt and return the response in the JSON form the server expects. */
export async function createPasskey(options: PasskeyCreationOptions): Promise<Record<string, unknown>> {
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: base64UrlToBytes(options.challenge),
        user: { ...options.user, id: base64UrlToBytes(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((c) => ({ ...c, id: base64UrlToBytes(c.id) })),
      },
    });
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new PasskeyError('The biometric prompt was cancelled or timed out. Try again, or choose another method.');
    }
    throw new PasskeyError('This device could not complete the biometric prompt. Choose another method.');
  }
  if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAttestationResponse)) {
    throw new PasskeyError('This device did not return a biometric confirmation. Choose another method.');
  }
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      attestationObject: bytesToBase64Url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}
