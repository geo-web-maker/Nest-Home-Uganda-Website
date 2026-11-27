import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScrollVars } from '../../hooks/useScrollVars';
import { cx } from '../../lib/cx';
import styles from './ThreadParts.module.css';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/* ---------------------------------------------------------------------------------------------
 * Story: the pinned "first call to first visit" section. Before hydration, with reduced motion,
 * or without JS it is a normal section: all steps visible, thread drawn, the nurse photo shown.
 * Enhanced: pinned for 340vh, a scroll hook writes --p and data-s, steps and orb layers follow.
 * ------------------------------------------------------------------------------------------- */
const STORY_PATH = 'M0 50 C 125 0, 250 0, 375 50 S 625 100, 750 50 S 900 10, 1000 50';

export function Story({
  steps,
  phone,
  telHref,
  planItems,
  photo,
  photoAlt,
  heading,
  callLabel,
  callSay,
  callSame,
  caption,
}: {
  steps: Array<{ title: string; text: string }>;
  phone: string;
  telHref: string;
  planItems: string[];
  photo?: string | null;
  photoAlt?: string;
  heading: string;
  callLabel: string;
  callSay: string;
  callSame: string;
  caption: string;
}) {
  void callLabel;
  const [active, setActive] = useState(1);
  const [enhanced, setEnhanced] = useState(false);
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const baseRef = useRef<SVGPathElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, len: 1 });

  // Pinning needs room. On a short window (a phone on its side) the pinned scene would be clipped,
  // so it falls back to the plain section where every step is visible.
  useEffect(() => {
    if (reduce || typeof window.matchMedia !== 'function') {
      setEnhanced(false);
      return;
    }
    const tall = window.matchMedia('(min-height: 600px)');
    const apply = () => setEnhanced(tall.matches);
    apply();
    tall.addEventListener?.('change', apply);
    return () => tall.removeEventListener?.('change', apply);
  }, [reduce]);

  const update = useCallback((section: HTMLElement) => {
    const rect = section.getBoundingClientRect();
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    const p = clamp(-rect.top / travel);
    const next = p < 0.34 ? 1 : p < 0.67 ? 2 : 3;
    section.style.setProperty('--p', p.toFixed(4));
    section.dataset.s = String(next);
    setActive((current) => (current === next ? current : next));
    const path = pathRef.current;
    const line = lineRef.current;
    const marker = markerRef.current;
    const svg = path?.ownerSVGElement;
    if (!path || !line || !marker || !svg) return;
    const box = svg.getBoundingClientRect();
    const size = sizeRef.current;
    if (box.width && (box.width !== size.w || box.height !== size.h)) {
      // Rebuild the thread in real pixels so the stroke is not stretched and dash lengths are exact.
      const x = (v: number) => ((v / 1000) * box.width).toFixed(1);
      const y = (v: number) => ((v / 100) * box.height).toFixed(1);
      const d = `M${x(0)} ${y(50)} C ${x(125)} ${y(0)}, ${x(250)} ${y(0)}, ${x(375)} ${y(50)} S ${x(625)} ${y(100)}, ${x(750)} ${y(50)} S ${x(900)} ${y(10)}, ${x(1000)} ${y(50)}`;
      svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
      for (const el of [baseRef.current, line, path]) el?.setAttribute('d', d);
      size.w = box.width;
      size.h = box.height;
      size.len = path.getTotalLength();
      line.style.strokeDasharray = `${size.len.toFixed(1)} ${size.len.toFixed(1)}`;
    }
    const point = path.getPointAtLength(size.len * p);
    line.style.strokeDashoffset = (size.len * (1 - p)).toFixed(1);
    marker.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
  }, []);
  useScrollVars(ref, update, enhanced, 0);

  return (
    <section ref={ref} className={cx(styles.story, 'on-strong')} data-enhanced={enhanced ? 'true' : undefined} data-s={active}>
      <div className={styles.stick}>
        <div className={cx('container', styles.storyGrid)}>
          <div>
            <h2>{heading}</h2>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title} className={cx(styles.step, active === index + 1 && styles.on)} data-n={index + 1}>
                  <span className={styles.num} aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.orb}>
            <div className={cx(styles.layer, styles.l1)} aria-hidden={active !== 1 ? 'true' : undefined}>
              <span className={styles.ripple} style={{ '--i': 0 } as CSSProperties} />
              <span className={styles.ripple} style={{ '--i': 1 } as CSSProperties} />
              <span className={styles.ripple} style={{ '--i': 2 } as CSSProperties} />
              <a className={styles.callcard} href={telHref} tabIndex={active === 1 ? undefined : -1}>
                <span className={styles.callSay}>{callSay}</span>
                <span className={styles.callNum}>{phone}</span>
                <span className={styles.callSay}>{callSame}</span>
              </a>
            </div>
            <div className={cx(styles.layer, styles.l2)} aria-hidden="true">
              <ul>{planItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <figure className={cx(styles.layer, styles.l3)} aria-hidden="true">
              {photo ? <img src={photo} alt={photoAlt ?? ''} loading="lazy" decoding="async" /> : <span className={styles.l3none} />}
              <figcaption>{caption}</figcaption>
            </figure>
          </div>
        </div>
        <div className={cx('container', styles.thread)} aria-hidden="true">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path ref={baseRef} className={styles.base} d={STORY_PATH} />
            <path ref={lineRef} className={styles.line} d={STORY_PATH} />
            <path ref={pathRef} d={STORY_PATH} fill="none" stroke="none" />
          </svg>
          <span ref={markerRef} className={styles.marker} />
        </div>
      </div>
    </section>
  );
}
