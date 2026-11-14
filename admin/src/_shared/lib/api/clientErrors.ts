/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
type ClientErrorInput = { name?: string; message: string; stack?: string; source?: string };
const reported = new Set<string>();
let installed = false;
let sending = false;

export function reportClientError(input: ClientErrorInput): void {
  if (typeof window === 'undefined' || sending) return;
  const message = String(input.message || 'Unknown client error').slice(0, 800);
  const name = String(input.name || 'ClientError').slice(0, 120);
  const route = `${window.location.pathname}${window.location.search}`.slice(0, 300);
  const signature = `${name}:${message}:${route}`;
  if (reported.has(signature)) return;
  reported.add(signature);
  if (reported.size > 50) reported.delete(reported.values().next().value as string);
  sending = true;
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  void fetch(`${base}/api/v1/client-errors`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name, message, stack: String(input.stack ?? '').slice(0, 6000),
      source: input.source ?? 'frontend', route,
      user_agent: navigator.userAgent.slice(0, 500),
    }),
  }).catch(() => undefined).finally(() => { sending = false; });
}

export function installClientErrorCapture(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportClientError({ name: event.error?.name ?? 'WindowError', message: event.message || 'Uncaught browser error', stack: event.error?.stack, source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError({
      name: reason instanceof Error ? reason.name : 'UnhandledRejection',
      message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection'),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandledrejection',
    });
  });
}
