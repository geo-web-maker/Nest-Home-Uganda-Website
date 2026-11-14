import type { ComposeSeed, MailRecipient } from './types';

const ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Splits a typed list on commas, semicolons and line breaks; removes blanks and repeats (case-insensitive). */
export function parseRecipients(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const address = part.trim();
    const key = address.toLowerCase();
    if (!address || seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

export function invalidRecipients(addresses: readonly string[]): string[] {
  return addresses.filter((address) => !ADDRESS.test(address));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SeedSource = {
  message_id: string;
  /** RFC Message-ID of the original (for example `<abc@host>`); preferred for In-Reply-To. */
  message_id_header?: string | null;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_text: string;
  recipients: readonly MailRecipient[];
};
type SeedContext = { me: string; date: string; wroteOn: (who: string, date: string) => string; forwardedHeader: string };
export type SeedKind = 'reply' | 'replyAll' | 'forward';

function prefixed(prefix: 'Re' | 'Fwd', subject: string): string {
  const clean = subject.trim();
  return new RegExp(`^${prefix}:\\s`, 'i').test(clean) ? clean : `${prefix}: ${clean}`.trim();
}


/** Builds the compose form for reply, reply all or forward. Bcc is never copied from the original. */
export function buildSeed(kind: SeedKind, source: SeedSource, ctx: SeedContext): ComposeSeed {
  const me = ctx.me.toLowerCase();
  const sender = source.from_address;
  if (kind === 'forward') {
    return {
      to: [],
      cc: [],
      bcc: [],
      subject: prefixed('Fwd', source.subject),
      body: '',
    };
  }
  const body = '';
  const seed: ComposeSeed = {
    to: [sender],
    cc: [],
    bcc: [],
    subject: prefixed('Re', source.subject),
    body,
    inReplyTo: source.message_id_header || source.message_id,
  };
  if (kind === 'replyAll') {
    const taken = new Set([me, sender.toLowerCase()]);
    for (const recipient of source.recipients) {
      const key = recipient.address.toLowerCase();
      if (recipient.kind === 'bcc' || taken.has(key)) continue;
      taken.add(key);
      seed.cc.push(recipient.address);
    }
  }
  return seed;
}
