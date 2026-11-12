import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useInViewOnce } from '../../hooks/useInViewOnce';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScrollVars } from '../../hooks/useScrollVars';
import { cx } from '../../lib/cx';
import styles from './ThreadParts.module.css';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

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
 * ShapeField: drifting egg, arch, ring and spinning diamond. Decorative. Parallax writes --sy once
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

/* ---------------------------------------------------------------------------------------------
 * Rail: sideways scroll of cards. Native scroll and snap. Mouse drag, arrow buttons, arrow keys,
 * progress bar. Tilt toward the pointer for mouse only (see RailCard).
 * ------------------------------------------------------------------------------------------- */
export function Rail({
  children,
  label,
  previousLabel,
  nextLabel,
  head,
}: {
  children: ReactNode;
  label: string;
  previousLabel: string;
  nextLabel: string;
  head?: ReactNode;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });

  const move = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.max(280, el.clientWidth * 0.7), behavior: reduce ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = el.scrollWidth - el.clientWidth;
      const progress = max <= 0 ? 1 : el.scrollLeft / max;
      fill.current?.style.setProperty('transform', `scaleX(${Math.max(0.1, progress)})`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLUListElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { active: true, moved: false, startX: event.clientX, startLeft: el.scrollLeft };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLUListElement>) => {
    const state = drag.current;
    const el = scroller.current;
    if (!state.active || !el) return;
    const dx = event.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 5) {
      state.moved = true;
      if (styles.dragging) el.classList.add(styles.dragging);
    }
    if (state.moved) el.scrollLeft = state.startLeft - dx;
  };
  const endDrag = () => {
    const el = scroller.current;
    if (drag.current.active) {
      drag.current.active = false;
      if (styles.dragging) el?.classList.remove(styles.dragging);
    }
  };

  return (
    <div className={styles.railWrap}>
      <div className={cx('container', styles.railHead)}>
        {head}
        <div className={styles.railCtl}>
          <button type="button" className={styles.ctl} aria-label={previousLabel} onClick={() => move(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className={styles.ctl} aria-label={nextLabel} onClick={() => move(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <ul
        ref={scroller}
        className={styles.rail}
        tabIndex={0}
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => {
          // A drag that ends over a card must not follow its link.
          if (drag.current.moved) {
            event.preventDefault();
            event.stopPropagation();
            drag.current.moved = false;
          }
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </ul>
      <div className={styles.barTrack} aria-hidden="true">
        <div ref={fill} className={styles.barFill} />
      </div>
    </div>
  );
}

export function RailCard({
  number,
  title,
  summary,
  href,
  photo,
  tone = 'f',
}: {
  number: string | number;
  title: string;
  summary: string;
  href: string;
  photo?: string | null;
  readLabel?: string;
  tone?: 'f' | 's' | 'l' | 'w';
}) {
  const onMove = (event: ReactPointerEvent<HTMLLIElement>) => {
    if (event.pointerType !== 'mouse') return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-py * 8).toFixed(2)}deg`);
  };
  const onLeave = (event: ReactPointerEvent<HTMLLIElement>) => {
    event.currentTarget.style.setProperty('--rx', '0deg');
    event.currentTarget.style.setProperty('--ry', '0deg');
  };
  return (
    <li className={cx(styles.card, styles[`tone-${tone}`])} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div>
        <span className={styles.cardNumber} aria-hidden="true">{String(number).padStart(2, '0')}</span>
      </div>
      <div>
        <h3>
          <Link to={href} className={styles.cardLink} draggable={false}>{title}</Link>
        </h3>
        <p>{summary}</p>
      </div>
      <span className={cx(styles.mini, !photo && styles.miniNone)} aria-hidden="true">
        {photo && <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} />}
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Hang: arches hung from a gold thread that draws itself, then sway gently. Pre-render and
 * reduced motion show the finished picture.
 * ------------------------------------------------------------------------------------------- */
export function Hang({ items, label }: { items: Array<{ title: string; caption: string; href: string; photo?: string | null; alt?: string }>; label: string }) {
  const [ref, state] = useInViewOnce<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className={styles.hang} data-state={state}>
      <svg className={styles.hangLine} viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d="M0 60 Q 83 20 167 60 T 333 60 T 500 60 T 667 60 T 833 60 T 1000 60" />
      </svg>
      <ul className={styles.hangList} aria-label={label}>
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className={cx(styles.hg, styles[`hg${index + 1}`])} style={{ '--i': index } as CSSProperties}>
            <Link to={item.href}>
              <Arch src={item.photo} alt={item.alt ?? ''} placeholder={!item.photo} ratio={index === 1 ? '3/4.6' : index === 2 ? '3/3.9' : '3/4'} />
              <span className={styles.cap}>
                <strong>{item.title}</strong>
                {item.caption}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  stepLink,
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
  stepLink: string;
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

  useEffect(() => {
    setEnhanced(!reduce && typeof window.matchMedia === 'function');
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
                    {index === 0 && <a className={styles.steplink} href={telHref}>{stepLink}</a>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.orb} aria-hidden="true">
            <div className={cx(styles.layer, styles.l1)}>
              <span className={styles.ripple} style={{ '--i': 0 } as CSSProperties} />
              <span className={styles.ripple} style={{ '--i': 1 } as CSSProperties} />
              <span className={styles.ripple} style={{ '--i': 2 } as CSSProperties} />
              <a className={styles.callcard} href={telHref} tabIndex={-1}>
                <span className={styles.callSay}>{callSay}</span>
                <span className={styles.callNum}>{phone}</span>
                <span className={styles.callSay}>{callSame}</span>
              </a>
            </div>
            <div className={cx(styles.layer, styles.l2)}>
              <ul>{planItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <figure className={cx(styles.layer, styles.l3)}>
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

/* ---------------------------------------------------------------------------------------------
 * FillWords: three huge outlined words that fill with ink as you scroll. Solid without JS and
 * with reduced motion.
 * ------------------------------------------------------------------------------------------- */
export function FillWords({ items }: { items: Array<{ word: string; text: string }> }) {
  const ref = useRef<HTMLUListElement>(null);
  const reduce = usePrefersReducedMotion();
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(!reduce), [reduce]);
  const update = useCallback((list: HTMLElement, vh: number) => {
    list.querySelectorAll<HTMLElement>('[data-fill]').forEach((word) => {
      const rect = word.getBoundingClientRect();
      const f = clamp((vh * 0.88 - rect.top) / (vh * 0.42));
      word.style.setProperty('--f', f.toFixed(3));
    });
  }, []);
  useScrollVars(ref, update, enhanced);
  return (
    <ul ref={ref} className={styles.pw} data-enhanced={enhanced ? 'true' : undefined}>
      {items.map((item) => (
        <li key={item.word}>
          <span className={styles.fill} data-fill>{item.word}</span>
          <span className={styles.d}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* Ledger: two-column rows. A missing value shows the dashed "to be supplied" style. */
export function Ledger({ rows, emptyValue, className }: { rows: Array<{ label: string; value?: string; missing?: boolean }>; emptyValue: string; className?: string }) {
  return (
    <ul className={cx(styles.ledger, className)}>
      {rows.map((row) => (
        <li key={row.label}>
          <strong>{row.label}</strong>
          <span className={row.missing || !row.value ? styles.tbc : undefined}>{row.value || emptyValue}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------------------------
 * VerticalSteps: the gold line fills and the egg marker travels as you scroll.
 * ------------------------------------------------------------------------------------------- */
export function VerticalSteps({ steps, label }: { steps: Array<{ title: string; text: string; art?: ReactNode }>; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(!reduce), [reduce]);
  const update = useCallback((el: HTMLElement, vh: number) => {
    const rect = el.getBoundingClientRect();
    const p = clamp((vh * 0.55 - rect.top) / Math.max(1, rect.height));
    el.style.setProperty('--vp', p.toFixed(4));
    el.style.setProperty('--vh', `${Math.max(0, rect.height - 35)}px`);
  }, []);
  useScrollVars(ref, update, enhanced, 0.5);
  return (
    <div ref={ref} className={styles.vsteps} data-enhanced={enhanced ? 'true' : undefined}>
      <div className={styles.vline} aria-hidden="true"><div className={styles.vfill} /></div>
      <span className={styles.vmark} aria-hidden="true" />
      <ol className={styles.vlist} aria-label={label}>
        {steps.map((step, index) => (
          <li key={step.title} className={styles.vstep}>
            <span className={styles.vnum} aria-hidden="true">{index + 1}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </div>
            {step.art && <div className={styles.vart}>{step.art}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * SealLink: the rotating "Tap to call" ring around a phone glyph. Duplicates the number link
 * beside it, so it is hidden from assistive tech and the tab order.
 * ------------------------------------------------------------------------------------------- */
export function SealLink({ href, text = 'Tap to call' }: { href: string; label?: string; text?: string }) {
  const id = useId().replace(/:/g, '');
  const ring = `${text} • `.repeat(3);
  return (
    <a className={styles.seal} href={href} tabIndex={-1} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          <path id={`seal-${id}`} d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" />
        </defs>
        <g className={styles.sealRing}>
          <text>
            <textPath href={`#seal-${id}`} startOffset="0">{ring}</textPath>
          </text>
        </g>
      </svg>
      <i />
    </a>
  );
}

/* ---------------------------------------------------------------------------------------------
 * ErrorDoor: the big code where the zero is a door. Open for 404, shut for 403, frayed for 500.
 * ------------------------------------------------------------------------------------------- */
function DoorGlyph({ kind }: { kind: 'open' | 'shut' | 'frayed' }) {
  if (kind === 'shut') {
    return (
      <svg viewBox="0 0 60 80" aria-hidden="true">
        <path className={styles.dShut} d="M5 78V30a25 25 0 0 1 50 0v48z" />
        <circle className={styles.dKey} cx="30" cy="44" r="5" />
        <path className={styles.dKey} d="M27.5 47h5l1.5 13h-8z" />
      </svg>
    );
  }
  if (kind === 'frayed') {
    return (
      <svg viewBox="0 0 60 80" aria-hidden="true">
        <path className={styles.dAr} d="M5 78V30a25 25 0 0 1 50 0v48z" />
        <path className={styles.dTh} d="M30 6v22l-7 7 12 8-9 9" />
        <circle className={styles.dDot} cx="26" cy="52" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 80" aria-hidden="true">
      <path className={styles.dAr} d="M5 78V30a25 25 0 0 1 50 0v48z" />
      <path className={styles.dLeaf} d="M5 78l19-7V30L5 34z" />
      <path className={styles.dTh} d="M34 71c8 6 14-6 26 2" />
      <circle className={styles.dDot} cx="61" cy="73" r="3" />
    </svg>
  );
}

export function ErrorDoor({ code, kind }: { code: string; kind: 'open' | 'shut' | 'frayed' }) {
  const chars = code.split('');
  const doorAt = chars.indexOf('0') === -1 ? 1 : chars.indexOf('0');
  return (
    <div className={styles.errorCode} aria-hidden="true">
      {chars.map((char, index) => (index === doorAt ? <DoorGlyph key={index} kind={kind} /> : <span key={index}>{char}</span>))}
    </div>
  );
}
