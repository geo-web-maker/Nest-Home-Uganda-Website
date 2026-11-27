import { useCallback, useRef, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScrollVars } from '../../hooks/useScrollVars';
import { cx } from '../../lib/cx';
import styles from './ThreadParts.module.css';

/* ---------------------------------------------------------------------------------------------
 * Arch: the door-shaped photo frame. With no photo it is the striped arch with a gold diamond.
 * The gold ring colour gap comes from --arch-gap so it matches the surface behind it.
 * ------------------------------------------------------------------------------------------- */
export function Arch({
  src,
  alt = '',
  placeholder = false,
  ratio = '3/4',
  className,
}: {
  src?: string | null;
  alt?: string;
  placeholder?: boolean;
  ratio?: string;
  className?: string;
}) {
  const none = !src || placeholder;
  return (
    <span className={cx(styles.arch, className)} style={{ aspectRatio: ratio }} data-placeholder={none ? 'true' : undefined} aria-hidden={none ? 'true' : undefined}>
      {!none && <img src={src} alt={alt} loading="lazy" decoding="async" />}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------
 * ShapeField: drifting leaf, arch, ring and spinning diamond. Decorative. Parallax writes --sy once
 * per frame while the field is near the viewport. No parallax with reduced motion.
 * ------------------------------------------------------------------------------------------- */
const SHAPES: Record<'hero' | 'page' | 'service' | 'error', string[]> = {
  hero: ['s1', 's2', 's3', 's4', 's5'],
  page: ['p1', 'p2', 'p3'],
  service: ['s1', 's3', 's4', 's5'],
  error: ['s1', 's2', 's3', 's5'],
};

export function ShapeField({ variant = 'page' }: { variant?: 'hero' | 'page' | 'service' | 'error' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = usePrefersReducedMotion();
  const update = useCallback((el: HTMLElement) => el.style.setProperty('--sy', String(window.scrollY)), []);
  useScrollVars(ref, update, !reduce);
  return (
    <span ref={ref} className={cx(styles.field, styles[`field-${variant}`])} aria-hidden="true">
      {SHAPES[variant].map((name) => (
        <span key={name} className={cx(styles.shape, styles[name])}>
          <i />
        </span>
      ))}
    </span>
  );
}

/** A wavy gold line. Used on the design preview page. */
export function ThreadLine({ vertical = false, className = '' }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <svg className={cx(styles.threadLine, styles.vertical, className)} viewBox="0 0 40 300" preserveAspectRatio="none" aria-hidden="true">
      <path d="M20 0 C5 48 35 76 20 112 S6 182 20 220 S34 270 20 300" />
    </svg>
  ) : (
    <svg className={cx(styles.threadLine, className)} viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 27 C130 5 205 44 340 24 S550 7 670 28 S860 42 1000 18" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------
 * HeroWords: headline whose words slide up one by one. One accessible name on the h1, the word
 * spans are hidden from assistive tech. Visible in static HTML (the animation only moves them).
 * ------------------------------------------------------------------------------------------- */
export function HeroWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <h1 className={className} aria-label={text}>
      {words.map((word, index) => (
        <span key={`${index}-${word}`}>
          <span className={styles.word} aria-hidden="true" style={{ '--i': index } as CSSProperties}>
            <span>{word}</span>
          </span>{' '}
        </span>
      ))}
    </h1>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Tape: tilted gold strip with the service names. The second copy is hidden from assistive tech.
 * Reduced motion: wrapped, one copy.
 * ------------------------------------------------------------------------------------------- */
export function Tape({ items }: { items: string[] }) {
  const reduce = usePrefersReducedMotion();
  if (!items.length) return null;
  return (
    <div className={cx(styles.tape, reduce && styles.tapeStatic)} role="group" aria-label={items.join(', ')}>
      <div className={styles.tapeRow}>
        {items.map((item, i) => (
          <span key={`a-${i}-${item}`}>{item}</span>
        ))}
        {!reduce &&
          items.map((item, i) => (
            <span key={`b-${i}-${item}`} aria-hidden="true">
              {item}
            </span>
          ))}
      </div>
    </div>
  );
}
