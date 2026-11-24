/** Browser (PWA) sign-in keeps the CSRF value here, so the refresh cookie can be exchanged for a new access token after a reload. */
export const WEB_CSRF_KEY = 'nurse_web_csrf';
/** True when a browser sign-in left a refresh credential behind (the cookie itself is HttpOnly, so its CSRF twin is the marker). */
export function hasStoredWebCredential(): boolean {
  try { return Boolean(localStorage.getItem(WEB_CSRF_KEY)); } catch { return false; }
}
export function saveWebCredential(csrf: string): void {
  try { localStorage.setItem(WEB_CSRF_KEY, csrf); } catch { /* storage blocked */ }
}
export function clearStoredWebCredential(): void {
  try { localStorage.removeItem(WEB_CSRF_KEY); } catch { /* storage blocked */ }
}
