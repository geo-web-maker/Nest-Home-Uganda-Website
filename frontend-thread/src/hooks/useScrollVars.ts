import { useEffect, type RefObject } from 'react';

/**
 * Runs `update` inside one passive scroll/resize listener, batched to a single animation frame.
 * Only active while the element is within `margin` viewport heights of the viewport, so a page
 * with several effects does not do work for sections that are far away. `update` should write
 * CSS variables or data attributes directly on the DOM, never React state.
 * Does nothing when `enabled` is false (reduced motion, no JS enhancement).
 */
export function useScrollVars(
  ref: RefObject<HTMLElement | null>,
  update: (el: HTMLElement, viewportHeight: number) => void,
  enabled: boolean,
  margin = 1.3,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let frame = 0;
    let near = true;
    const run = () => {
      frame = 0;
      if (!near) return;
      update(el, window.innerHeight);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(run);
    };
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          near = entries.some((entry) => entry.isIntersecting);
          if (near) schedule();
        },
        { rootMargin: `${margin * 100}% 0px ${margin * 100}% 0px` },
      );
      observer.observe(el);
    }
    run();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [ref, update, enabled, margin]);
}
