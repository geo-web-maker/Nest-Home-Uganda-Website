type Input = { name?: string; message: string; stack?: string; source?: string };
const sent = new Set<string>();
let busy = false;
let installed = false;
const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function reportNurseClientError(input: Input): void {
  if (typeof window === 'undefined' || busy) return;
  const message = String(input.message || 'Unknown client error').slice(0, 800);
  const name = String(input.name || 'ClientError').slice(0, 120);
  const route = `${location.pathname}${location.search}`.slice(0, 300);
  const key = `${name}:${message}:${route}`;
  if (sent.has(key)) return;
  sent.add(key);
  if (sent.size > 50) sent.delete(sent.values().next().value as string);
  busy = true;
  void fetch(`${apiBase}/api/v1/client-errors`, {
    method: 'POST', credentials: apiBase ? 'include' : 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, message, stack: String(input.stack ?? '').slice(0, 6000), source: input.source ?? 'nurse', route, user_agent: navigator.userAgent.slice(0, 500) }),
  }).catch(() => undefined).finally(() => { busy = false; });
}

export function installNurseClientErrorCapture(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  window.addEventListener('error', (event) => reportNurseClientError({ name: event.error?.name ?? 'WindowError', message: event.message || 'Uncaught browser error', stack: event.error?.stack, source: 'window.onerror' }));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportNurseClientError({ name: reason instanceof Error ? reason.name : 'UnhandledRejection', message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection'), stack: reason instanceof Error ? reason.stack : undefined, source: 'unhandledrejection' });
  });
}
