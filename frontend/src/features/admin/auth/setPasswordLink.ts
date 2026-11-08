import { ApiError } from '../../../lib/api/client';
import { supportRef } from '../../public/agreements/linkFailure';

/** Why a set-password (invite or reset) link cannot be used, in words the person can act on. */
export type SetPasswordProblem = {
  /** link = the server understood the link and said why it cannot be used here. */
  kind: 'link' | 'busy' | 'server' | 'network' | 'unexpected';
  title: string;
  lines: string[];
  retry: boolean;
  /** Offer the sign-in page (the link was used, so the password is probably already set). */
  signIn: boolean;
  /** Support reference, e.g. S3-9F2A1C-k3j2.7c3d. */
  ref: string;
};

const TITLES: Record<string, string> = {
  malformed: 'This link is incomplete',
  not_found: 'We could not find this link',
  used: 'This link was already used',
  expired: 'This link has expired',
  superseded: 'This link was replaced',
  wrong_kind: 'This link is for a different step',
  inactive: 'This account is not active',
};
const ADVICE: Record<string, string> = {
  malformed: 'Open the link exactly as we sent it. If you typed it, copy and paste the whole link instead.',
  not_found: 'Please check you are using the newest email or SMS.',
  used: 'If you already chose a password, you can sign in now.',
  expired: 'For your security, these links stop working after a while. Ask an administrator to send a new one.',
  superseded: 'Please open the most recent email or SMS you received.',
  wrong_kind: 'Please open the most recent email or SMS you received.',
  inactive: 'Please contact an administrator.',
};
const CODES: Record<string, string> = {
  malformed: 'S1', not_found: 'S2', used: 'S3', expired: 'S4', superseded: 'S5', wrong_kind: 'S6', inactive: 'S7',
};

const INVISIBLE = /[\u200b\u200c\u200d\u2060\ufeff\u00a0]/g;
const TRIM = /^[\s.,;:!?()[\]<>"'\u201c\u201d\u2018\u2019]+|[\s.,;:!?()[\]<>"'\u201c\u201d\u2018\u2019]+$/g;

/** Undo copy/paste damage in a link token (spaces, line breaks, zero-width characters, a whole pasted URL). */
export function cleanToken(raw: string): string {
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { /* keep as typed */ }
  text = text.replace(INVISIBLE, '');
  const found = /token=([^&#\s]+)/.exec(text);
  if (found?.[1]) text = found[1];
  text = text.replace(TRIM, '').replace(/\s+/g, '');
  return /^[A-Za-z0-9_-]{20,200}$/.test(text) ? text : '';
}

export function problemForState(state: string, ref?: string): SetPasswordProblem {
  const known = state in TITLES ? state : 'not_found';
  return {
    kind: 'link', title: TITLES[known]!, retry: false, signIn: known === 'used',
    lines: [ADVICE[known]!],
    ref: ref ?? supportRef(CODES[known]!, undefined, undefined),
  };
}

export function describeSetPasswordFailure(cause: unknown): SetPasswordProblem {
  if (cause instanceof ApiError) {
    const state = cause.fields?.state;
    if (state && cause.fields?.token) {
      const problem = problemForState(state);
      const code = cause.fields.ref?.split('-')[0] ?? CODES[state] ?? 'S0';
      const fingerprint = cause.fields.ref?.split('-')[1];
      return { ...problem, lines: [cause.message, ADVICE[state] ?? ''].filter(Boolean), ref: supportRef(code, fingerprint, undefined) };
    }
    if (cause.status === 0) {
      return { kind: 'network', title: 'We could not reach the server', retry: true, signIn: false,
        lines: ['Your link is fine. Check your internet connection, switch between Wi-Fi and mobile data, and try again.'],
        ref: supportRef('N1', undefined, undefined) };
    }
    if (cause.status === 429) {
      return { kind: 'busy', title: 'Too many attempts', retry: true, signIn: false,
        lines: ['Please wait a few minutes and try again. Your link is fine.'], ref: supportRef('N2', undefined, undefined) };
    }
    if (cause.status >= 500) {
      return { kind: 'server', title: 'Something went wrong on our side', retry: true, signIn: false,
        lines: ['Your link is fine. Please try again in a moment.'],
        ref: supportRef('N3', cause.requestId?.slice(0, 6).toUpperCase(), undefined) };
    }
  }
  return { kind: 'unexpected', title: 'We could not check your link', retry: true, signIn: false,
    lines: ['Please reload the page. If it still fails, contact an administrator with the reference below.'],
    ref: supportRef('N4', undefined, undefined) };
}
