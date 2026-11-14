/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
/**
 * Lets any API call ask the signed-in person for an authenticator code before an error is shown.
 * The admin installs the prompt host once; the API client calls `requestTotp` when the server
 * answers 403 `totp_required`, then repeats the request if the code was accepted.
 */
type Handler = () => Promise<boolean>;

let handler: Handler | null = null;
let pending: Promise<boolean> | null = null;
let cancelledAt = 0;
/** After a cancel, parallel and retried requests fail straight away instead of re-opening the prompt. */
const QUIET_MS = 8000;

export function registerTotpPrompt(next: Handler | null): () => void {
  handler = next;
  return () => { if (handler === next) handler = null; };
}

export async function requestTotp(): Promise<boolean> {
  if (!handler) return false;
  if (pending) return pending;
  if (Date.now() - cancelledAt < QUIET_MS) return false;
  pending = handler().then((ok) => {
    if (!ok) cancelledAt = Date.now();
    return ok;
  }).finally(() => { pending = null; });
  return pending;
}
