/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'HR', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'TR', 'UL',
]);

export function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const output: string[] = [];
  const visit = (node: Node, quoteDepth = 0, list: { kind: 'ol' | 'ul'; number: number }[] = []) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent ?? '';
      if (quoteDepth) text = text.replace(/^/gm, '> ');
      output.push(text);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    const nextQuote = quoteDepth + (tag === 'BLOCKQUOTE' ? 1 : 0);
    const nextList = list.slice();
    if (tag === 'OL' || tag === 'UL') nextList.push({ kind: tag.toLowerCase() as 'ol' | 'ul', number: 0 });
    if (BLOCKS.has(tag)) output.push('\n');
    if (tag === 'LI' && nextList.length) {
      const current = nextList[nextList.length - 1];
      if (current) current.number += 1;
      output.push(current?.kind === 'ol' ? `\n${current.number}. ` : '\n- ');
    }
    if (tag === 'TD' || tag === 'TH') output.push('\t');
    for (const child of Array.from(node.childNodes)) visit(child, nextQuote, nextList);
    if (tag === 'A') {
      const href = node.getAttribute('href') ?? '';
      const label = node.textContent?.trim() ?? '';
      if (href && label && href !== label) output.push(` (${href})`);
    }
    if (tag === 'TD' || tag === 'TH') output.push('\t');
    if (BLOCKS.has(tag)) output.push('\n');
  };
  for (const child of Array.from(document.body.childNodes)) visit(child);
  return output.join('').replace(/ +/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
