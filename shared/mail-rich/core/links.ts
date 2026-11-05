export type LinkInspection = {
  allowed: boolean;
  external: boolean;
  hostname: string;
  reason: 'unsafe-scheme' | 'invalid-url' | 'external' | 'internal';
};

export function inspectMailLink(href: string, baseUrl?: string): LinkInspection {
  try {
    const base = baseUrl ?? (typeof window === 'undefined' ? 'https://nest.invalid' : window.location.origin);
    const url = new URL(href, base);
    const scheme = url.protocol.toLowerCase();
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(scheme)) {
      return { allowed: false, external: false, hostname: '', reason: 'unsafe-scheme' };
    }
    const external = scheme === 'http:' || scheme === 'https:'
      ? url.hostname !== new URL(base).hostname
      : false;
    return {
      allowed: true,
      external,
      hostname: url.hostname,
      reason: external ? 'external' : 'internal',
    };
  } catch {
    return { allowed: false, external: false, hostname: '', reason: 'invalid-url' };
  }
}
