import type { MailRecipient, RecipientKind } from './types';

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function parseRecipients(value: string | string[]): string[] {
  const source = Array.isArray(value) ? value.join(',') : value;
  const found = source
    .split(/[;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const bracketed = part.match(/<([^<>]+)>/);
      return (bracketed?.[1] ?? part).trim().toLowerCase();
    });
  return [...new Set(found)];
}

export function invalidRecipients(addresses: string[]): string[] {
  return addresses.filter((address) => !EMAIL.test(address));
}

export function replySubject(subject: string, kind: 'reply' | 'forward'): string {
  const clean = subject.trim();
  const prefix = kind === 'reply' ? 'Re:' : 'Fwd:';
  return new RegExp(`^${prefix.replace(':', '\\:')}\\s`, 'i').test(clean)
    ? clean
    : `${prefix} ${clean}`.trim();
}

export function replyRecipients(
  source: MailRecipient[],
  fromAddress: string,
  ownAddresses: string[],
  all: boolean,
): { to: string[]; cc: string[] } {
  const own = new Set(ownAddresses.map((item) => item.toLowerCase()));
  const sender = fromAddress.toLowerCase();
  const to = sender && !own.has(sender) ? [sender] : [];
  const cc = all
    ? source
        .filter((item) => item.kind === 'to' || item.kind === 'cc')
        .map((item) => item.address.toLowerCase())
        .filter((address) => !own.has(address) && !to.includes(address))
    : [];
  return { to: [...new Set(to)], cc: [...new Set(cc)] };
}

export function buildSeed(input: {
  kind: 'reply' | 'reply_all' | 'forward';
  subject: string;
  from_address: string;
  recipients: MailRecipient[];
  own_addresses?: string[];
}): { to: string[]; cc: string[]; bcc: string[]; subject: string } {
  const own = input.own_addresses ?? [];
  if (input.kind === 'forward') {
    return { to: [], cc: [], bcc: [], subject: replySubject(input.subject, 'forward') };
  }
  const recipients = replyRecipients(
    input.recipients,
    input.from_address,
    own,
    input.kind === 'reply_all',
  );
  return { ...recipients, bcc: [], subject: replySubject(input.subject, 'reply') };
}

export function groupRecipients(recipients: MailRecipient[]): Record<RecipientKind, string[]> {
  return {
    to: recipients.filter((item) => item.kind === 'to').map((item) => item.address),
    cc: recipients.filter((item) => item.kind === 'cc').map((item) => item.address),
    bcc: recipients.filter((item) => item.kind === 'bcc').map((item) => item.address),
  };
}
