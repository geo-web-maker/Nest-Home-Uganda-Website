import { useEffect, useRef, useState } from 'react';

/**
 * One-shot IntersectionObserver. `state` is 'static' on the server and before hydration (so the
 * pre-rendered HTML shows the finished picture), then 'pending' once enhanced, then 'in' when seen.
 * With reduced motion or no IntersectionObserver it stays 'static'.
 */
export function useInViewOnce<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<'static' | 'pending' | 'in'>('static');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') return;
    setState('pending');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('in');
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, state] as const;
}
