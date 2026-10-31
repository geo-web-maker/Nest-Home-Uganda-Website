const ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Splits typed recipients on commas, semicolons and line breaks; drops blanks and case-insensitive repeats. */
export function parseAddresses(text: string): string[] {
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

export function invalidAddresses(addresses: readonly string[]): string[] {
  return addresses.filter((address) => !ADDRESS.test(address));
}

export function replySubject(subject: string): string {
  const clean = subject.trim();
  return /^re:\s/i.test(clean) ? clean : `Re: ${clean}`.trim();
}

/** Quotes every line of the original, the way the admin reply does. */
export function quoteBody(body: string): string {
  return body.split('\n').map((line) => `> ${line}`).join('\n');
}
