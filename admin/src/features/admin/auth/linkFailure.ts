import { ApiError } from '@shared/lib/api/client';

declare const __BUILD_ID__: string | undefined;

/** Identifies which build of this page the visitor is running (helps spot a cached old copy). */
export const WEB_BUILD: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export type LinkFailure = {
  /** link = the server understood the link and said why it cannot be used. */
  kind: 'link' | 'busy' | 'server' | 'network' | 'unexpected';
  title: string;
  /** What the visitor can safely read and do. */
  lines: string[];
  retry: boolean;
  /** Support reference, e.g. L3-9F2A1C-k3j2.7c3d. Decoded in docs/AGREEMENT_LINKS.md. */
  ref: string;
};

const LINK_TITLES: Record<string, string> = {
  malformed: 'This link is incomplete',
  mistyped: 'This link is incomplete',
  not_found: 'We could not find this agreement',
  superseded: 'This link has been replaced',
  expired: 'This agreement link has expired',
  signed: 'This agreement is already signed',
  revoked: 'This link was withdrawn',
  closed: 'This agreement is not open right now',
};
const LINK_ADVICE: Record<string, string> = {
  malformed: 'Please open the link exactly as we sent it. If you typed it, copy and paste it instead.',
  mistyped: 'A character may be missing or wrong. Please open the link exactly as we sent it, or copy and paste the whole link.',
  not_found: 'Please check you are using the newest email or SMS from Bloomwell.',
  superseded: 'Please open the most recent email or SMS from Bloomwell.',
  expired: 'For your security, agreement links stop working after 14 days.',
  signed: 'Nothing more is needed. If you need a copy, contact us.',
  revoked: 'Please contact us and we will send a new one.',
  closed: 'It may be waiting for Bloomwell to review a change. We will contact you.',
};

/** Compact reference: <code>-<link id>-<web build>.<api release>. */
export function supportRef(code: string, linkId: string | undefined, release: string | undefined): string {
  return `${code}-${linkId || '------'}-${WEB_BUILD}.${release || '?'}`;
}

export function describeLinkFailure(cause: unknown): LinkFailure {
  if (cause instanceof ApiError) {
    const state = cause.fields?.state;
    if (cause.code.startsWith('link_') && state) {
      const code = cause.fields.ref?.split('-')[0] ?? 'L0';
      return {
        kind: 'link', title: LINK_TITLES[state] ?? 'Agreement link unavailable', retry: false,
        lines: [cause.message, LINK_ADVICE[state] ?? ''].filter(Boolean),
        ref: supportRef(code, cause.fields.link_id, cause.fields.release),
      };
    }
    if (cause.status === 0) {
      return { kind: 'network', title: 'We could not open your agreement', retry: true,
        lines: ['We could not reach Bloomwell just now. Your link is fine. Check your internet connection, switch between Wi-Fi and mobile data, and try again.'],
        ref: supportRef('N1', undefined, apiHost()) };
    }
    if (cause.status === 429) {
      return { kind: 'busy', title: 'Too many attempts', retry: true,
        lines: ['Please wait a few minutes and try again. Your link is fine.'],
        ref: supportRef('N2', undefined, undefined) };
    }
    if (cause.status >= 500) {
      return { kind: 'server', title: 'Something went wrong on our side', retry: true,
        lines: ['Your link is fine. Please try again in a moment.'],
        ref: supportRef('N3', cause.requestId?.slice(0, 6).toUpperCase(), undefined) };
    }
    if (cause.code === 'invalid_response') {
      return { kind: 'unexpected', title: 'We could not open your agreement', retry: true,
        lines: ['The website received a reply that was not from Bloomwell\u2019s server. Your link is fine. Please try again, and if it still fails contact us with the reference below.'],
        ref: supportRef('N7', undefined, `h${cause.status}`) };
    }
    if (cause.status === 401 || cause.status === 403) {
      return { kind: 'unexpected', title: 'Your connection was blocked', retry: true,
        lines: ['Something between your device and Bloomwell refused the request. Your link is fine. Try another connection (Wi-Fi or mobile data), turn off any VPN or content blocker, and try again.'],
        ref: supportRef('N6', undefined, `h${cause.status}`) };
    }
    // An error that does not carry a link reason: usually an old server version or a stale cached copy.
    return { kind: 'unexpected', title: 'We could not open your agreement', retry: true,
      lines: ['This page may be out of date. Please reload it. If it still fails, contact us with the reference below.'],
      ref: supportRef(cause.status === 404 ? 'N5' : 'N4', undefined, `h${cause.status}`) };
  }
  return { kind: 'unexpected', title: 'We could not open your agreement', retry: true,
    lines: ['The page received an unexpected reply. Please reload it. If it still fails, contact us with the reference below.'],
    ref: supportRef('N4', undefined, undefined) };
}

function apiHost(): string {
  const base = String(import.meta.env.VITE_API_URL ?? '');
  try { return base ? new URL(base).hostname.split('.')[0]!.slice(0, 8) : 'same'; } catch { return '?'; }
}

/** Retry a load that failed only because the network did not answer (sleeping server, weak signal). */
export async function loadWithRetry<T>(load: () => Promise<T>, delaysMs: number[] = [1500, 4000]): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await load(); } catch (cause) {
      const delay = delaysMs[attempt];
      if (!(cause instanceof ApiError) || cause.status !== 0 || delay === undefined) throw cause;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
