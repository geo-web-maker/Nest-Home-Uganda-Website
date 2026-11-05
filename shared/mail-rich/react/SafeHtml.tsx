import { useEffect, useRef } from 'react';
import { inspectMailLink } from '../core/links';
import { sanitizeToFragment } from '../core/sanitize';

export function SafeHtml({
  html,
  className,
  onExternalLink,
  allowRemoteImages = false,
}: {
  html: string;
  className?: string;
  onExternalLink?: (url: string, hostname: string) => void;
  allowRemoteImages?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const fragment = sanitizeToFragment(html);
    if (allowRemoteImages) {
      for (const image of Array.from(fragment.querySelectorAll('img[data-remote-src]'))) {
        const remote = image.getAttribute('data-remote-src');
        if (remote && /^https?:\/\//i.test(remote)) image.setAttribute('src', remote);
      }
    }
    element.replaceChildren(fragment);
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      const inspection = inspectMailLink(href);
      if (!inspection.allowed) {
        event.preventDefault();
        return;
      }
      if (inspection.external) {
        event.preventDefault();
        onExternalLink?.(href, inspection.hostname);
      }
    };
    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('click', onClick);
      element.replaceChildren();
    };
  }, [allowRemoteImages, html, onExternalLink]);

  return <div ref={root} className={className} />;
}
