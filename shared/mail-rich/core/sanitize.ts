import policy from '../policy/mail-html-policy.json';
import { filterMailStyle } from './css';

const ALLOWED_TAGS = new Set(policy.allowed_tags.map((item) => item.toUpperCase()));
const DROP_CONTENT = new Set(policy.drop_content_tags.map((item) => item.toUpperCase()));
const VOID_TAGS = new Set(policy.void_tags.map((item) => item.toUpperCase()));
const GLOBAL_ATTRS = new Set(policy.global_attributes.map((item) => item.toLowerCase()));
const TAG_ATTRS = policy.tag_attributes as Record<string, string[]>;
// eslint-disable-next-line no-control-regex -- stripping control characters is the purpose
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function safeUrl(value: string, tag: string, name: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (name === 'href') {
    if (scheme && !policy.link_schemes.includes(scheme)) return null;
    return trimmed;
  }
  if (name === 'src' && tag === 'IMG') {
    if (!scheme || policy.image_schemes.includes(scheme)) {
      if (scheme === 'data' && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(trimmed)) return null;
      return trimmed;
    }
  }
  return null;
}

function copyNode(source: Node, target: Node, depth: number, count: { value: number; exceeded: boolean }): void {
  if (depth > policy.max_depth || count.value >= policy.max_nodes) {
    count.exceeded = true;
    return;
  }
  if (source.nodeType === Node.TEXT_NODE) {
    target.appendChild(document.createTextNode(source.textContent ?? ''));
    count.value += 1;
    return;
  }
  if (!(source instanceof Element)) return;
  const tag = source.tagName;
  if (DROP_CONTENT.has(tag)) return;
  const destination = ALLOWED_TAGS.has(tag) ? document.createElement(tag.toLowerCase()) : null;
  const parent = destination ?? target;
  if (destination) {
    for (const attribute of Array.from(source.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') continue;
      if (name.startsWith('data-')) {
        if (tag === 'IMG' && name === 'data-remote-src' && /^https?:\/\//i.test(attribute.value)) {
          destination.setAttribute(name, attribute.value.slice(0, 2048));
        }
        continue;
      }
      if (name === 'style') {
        const styles = filterMailStyle(attribute.value);
        for (const [property, value] of Object.entries(styles)) destination.style.setProperty(property, value);
        continue;
      }
      if (!GLOBAL_ATTRS.has(name) && !(TAG_ATTRS[tag.toLowerCase()] ?? []).includes(name)) continue;
      if (name === 'href' || name === 'src') {
        const url = safeUrl(attribute.value, tag, name);
        if (url) destination.setAttribute(name, url);
        continue;
      }
      if (name === 'target' && attribute.value !== '_blank') continue;
      destination.setAttribute(name, attribute.value.replace(CONTROL, '').slice(0, 2048));
    }
    if (tag === 'A' && destination.hasAttribute('href')) {
      destination.setAttribute('target', '_blank');
      destination.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    target.appendChild(destination);
    count.value += 1;
    if (VOID_TAGS.has(tag)) return;
  }
  for (const child of Array.from(source.childNodes)) copyNode(child, parent, depth + 1, count);
}

export function sanitizeToFragment(html: string): DocumentFragment {
  if (typeof DOMParser === 'undefined') throw new Error('Mail HTML rendering requires a browser DOM.');
  const source = new DOMParser().parseFromString(html.slice(0, policy.max_html_kb * 1024), 'text/html');
  const fragment = document.createDocumentFragment();
  const count = { value: 0, exceeded: false };
  for (const child of Array.from(source.body.childNodes)) copyNode(child, fragment, 0, count);
  if (count.exceeded) {
    const fallback = document.createElement('pre');
    fallback.textContent = source.body.textContent ?? '';
    const safeFallback = document.createDocumentFragment();
    safeFallback.appendChild(fallback);
    return safeFallback;
  }
  return fragment;
}

function escapeMarkup(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serializeSafeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkup(node.textContent ?? '');
  if (!(node instanceof Element)) {
    return Array.from(node.childNodes).map(serializeSafeNode).join('');
  }
  const tag = node.tagName.toLowerCase();
  const attributes: string[] = [];
  for (const attribute of Array.from(node.attributes)) {
    if (attribute.name === 'style') continue;
    attributes.push(`${attribute.name}="${escapeMarkup(attribute.value)}"`);
  }
  const style = node.getAttribute('style');
  if (style) attributes.push(`style="${escapeMarkup(style)}"`);
  const opening = `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>`;
  if (VOID_TAGS.has(node.tagName)) return opening;
  return `${opening}${Array.from(node.childNodes).map(serializeSafeNode).join('')}</${tag}>`;
}

export function sanitizeToString(html: string): string {
  return Array.from(sanitizeToFragment(html).childNodes).map(serializeSafeNode).join('');
}
