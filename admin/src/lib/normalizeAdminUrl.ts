/** Converts legacy admin page URLs to the standalone admin origin's page paths. */
export function normalizeAdminUrl(value: string, origin: string): string {
  try {
    const parsed = new URL(value, origin);
    const base = new URL(origin);
    if (parsed.origin !== base.origin) return value;
    parsed.pathname = parsed.pathname.replace(/^\/admin(?=\/|$)/, '') || '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}
