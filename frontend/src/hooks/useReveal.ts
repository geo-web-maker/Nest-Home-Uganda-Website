import { useEffect, useRef, type RefObject } from 'react';

export interface UseRevealOptions {
  /** IntersectionObserver threshold, 0 to 1. */
  threshold?: number;
  /** IntersectionObserver rootMargin. */
  rootMargin?: string;
}

/**
 * Scroll reveal without React state.
 * Content is visible in the pre-rendered HTML. After hydration, only elements that
 * start below the viewport get data-reveal="hidden", then "shown" once seen (once).
 * Anything already in view at load is left alone. Reduced motion and missing
 * IntersectionObserver leave the element visible.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(
  options: UseRevealOptions = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const { threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === 'undefined' ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.setAttribute('data-reveal', 'hidden');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.setAttribute('data-reveal', 'shown');
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (el.getAttribute('data-reveal') === 'hidden') el.setAttribute('data-reveal', 'shown');
    };
  }, [threshold, rootMargin]);

  return ref;
}
