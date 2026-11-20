/**
 * The build number this client sends as `X-Client-Build` on signed-in requests.
 * Bump it together with CURRENT_BUILD in backend core/client_guard.py (and the admin client's
 * copy in frontend/src/lib/api/clientBuild.ts) whenever a client change ships that old copies must not skip.
 */
export const CLIENT_BUILD = 1;
export const BUILD_HEADER = 'X-Client-Build';

type Listener = () => void;
const listeners = new Set<Listener>();
let required = false;

/** True once the server has answered 426 upgrade_required in this page session. */
export const isUpgradeRequired = (): boolean => required;

/** Called by the API client when the server says this build is too old. */
export function markUpgradeRequired(): void {
  required = true;
  listeners.forEach((listener) => listener());
}

/** Subscribe to the upgrade-required signal. Returns the unsubscribe function. */
export function onUpgradeRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper. */
export function resetUpgradeRequired(): void {
  required = false;
  listeners.clear();
}
