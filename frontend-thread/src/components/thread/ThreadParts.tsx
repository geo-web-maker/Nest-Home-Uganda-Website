import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import styles from './ThreadParts.module.css';

export function Arch({ src, alt = '', placeholder = false, ratio = '3/4' }: { src?: string | null; alt?: string; placeholder?: boolean; ratio?: string }) {
  return (
    <span className={styles.arch} style={{ aspectRatio: ratio }} data-placeholder={!src || placeholder ? 'true' : undefined}>
      {src && !placeholder ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className={styles.diamond} aria-hidden="true" />}
    </span>
  );
}

export function ShapeField({ variant = 'page' }: { variant?: 'hero' | 'page' | 'service' | 'error' }) {
  return <span className={`${styles.shapeField} ${styles[`shape-${variant}`]}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export function ThreadLine({ vertical = false, className = '' }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <svg className={`${styles.threadLine} ${styles.vertical} ${className}`} viewBox="0 0 40 300" preserveAspectRatio="none" aria-hidden="true"><path d="M20 0 C5 48 35 76 20 112 S6 182 20 220 S34 270 20 300" /></svg>
  ) : (
    <svg className={`${styles.threadLine} ${className}`} viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true"><path d="M0 27 C130 5 205 44 340 24 S550 7 670 28 S860 42 1000 18" /></svg>
  );
}

export function Tape({ items }: { items: string[] }) {
  const reduce = usePrefersReducedMotion();
  if (!items.length) return null;
  return <div className={`${styles.tape} ${reduce ? styles.tapeStatic : ''}`} role="group" aria-label={items.join(', ')}><div className={styles.tapeTrack}><ul>{items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>{!reduce && <ul aria-hidden="true">{items.map((item, i) => <li key={`copy-${i}-${item}`}>{item}</li>)}</ul>}</div></div>;
}

export function Rail({ children, label, previousLabel, nextLabel }: { children: ReactNode; label: string; previousLabel: string; nextLabel: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const move = (direction: -1 | 1) => scroller.current?.scrollBy({ left: direction * Math.max(260, scroller.current.clientWidth * .75), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setProgress(el.scrollWidth <= el.clientWidth ? 1 : el.scrollLeft / (el.scrollWidth - el.clientWidth));
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <div className={styles.railWrap}>
    <div className={styles.railControls}><button type="button" aria-label={previousLabel} onClick={() => move(-1)}>←</button><button type="button" aria-label={nextLabel} onClick={() => move(1)}>→</button></div>
    <div ref={scroller} className={styles.rail} tabIndex={0} aria-label={label} onKeyDown={(event) => { if (event.key === 'ArrowRight') move(1); if (event.key === 'ArrowLeft') move(-1); }}>
      {children}
    </div>
    <div className={styles.railProgress} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
  </div>;
}

export function RailCard({ number, title, summary, href, photo, readLabel, tone = 'f' }: { number: string | number; title: string; summary: string; href: string; photo?: string | null; readLabel: string; tone?: 'f' | 's' | 'l' | 'w' }) {
  return <article className={`${styles.railCard} ${styles[`tone-${tone}`]}`}>
    <Link to={href} className={styles.railCardLink}>
      <span className={styles.railNumber}>{String(number).padStart(2, '0')}</span>
      <h3>{title}</h3><p>{summary}</p>
      <Arch src={photo} alt="" placeholder={!photo} ratio="4/3" />
      <span className={styles.readMore}>{readLabel} <span aria-hidden="true">↗</span></span>
    </Link>
  </article>;
}

export function Hang({ items, label }: { items: Array<{ title: string; caption: string; href: string; photo?: string | null }>; label: string }) {
  return <section className={styles.hang} aria-label={label}><ThreadLine />
    <div className={styles.hangGrid}>{items.map((item, index) => <Link to={item.href} className={styles.hangItem} key={`${item.title}-${index}`}>
      <Arch src={item.photo} alt="" placeholder={!item.photo} /><strong>{item.title}</strong><span>{item.caption}</span>
    </Link>)}</div>
  </section>;
}

export function Story({ steps, phone, planItems, photo, eyebrow, heading, firstCall, talkToTeam, carePlan, homeVisit }: { steps: Array<{ title: string; text: string }>; phone: string; planItems: string[]; photo?: string | null; eyebrow: string; heading: string; firstCall: string; talkToTeam: string; carePlan: string; homeVisit: string }) {
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);

  // Pin only on wide screens. The server/no-JS/mobile/reduced-motion version keeps every layer visible.
  useEffect(() => {
    const canPin = !reduce && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1040px)').matches;
    setEnhanced(canPin);
  }, [reduce]);

  // One passive scroll handler, batched to one animation frame; React only updates when the active step changes.
  useEffect(() => {
    const section = ref.current;
    if (!enhanced || !section) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        const sectionTop = window.scrollY + rect.top;
        const travel = Math.max(1, section.offsetHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, (window.scrollY - sectionTop) / travel));
        const next = progress < 0.34 ? 0 : progress < 0.67 ? 1 : 2;
        section.style.setProperty('--p', String(progress));
        section.dataset.s = String(next + 1);
        setActive((current) => current === next ? current : next);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enhanced]);

  return <section ref={ref} className={`${styles.story} on-strong`} data-enhanced={enhanced ? 'true' : undefined} data-s={active + 1}>
    <div className={`container ${styles.storyGrid}`}>
      <div><p className={styles.storyEyebrow}>{eyebrow}</p><h2>{heading}</h2>
        <ol className={styles.storySteps}>{steps.map((step, index) => <li key={step.title} data-story-step={index} data-active={active === index ? 'true' : 'false'}><span>{`0${index + 1}`}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
      </div>
      <div className={styles.storyVisual} data-static={!enhanced ? 'true' : undefined}>
        {!enhanced ? <div className={styles.storyFallback}>
          <div className={styles.callSketch}><span>{firstCall}</span><a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a><small>{talkToTeam}</small></div>
          <div className={styles.planSketch}><span>{carePlan}</span>{planItems.map((item) => <p key={item}><i aria-hidden="true" />{item}</p>)}</div>
          <Arch src={photo} alt={homeVisit} placeholder={!photo} ratio="3/4" />
        </div> : active === 0 ? <div className={styles.callSketch}><span>{firstCall}</span><a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a><small>{talkToTeam}</small></div> : active === 1 ? <div className={styles.planSketch}><span>{carePlan}</span>{planItems.map((item) => <p key={item}><i aria-hidden="true" />{item}</p>)}</div> : <Arch src={photo} alt={homeVisit} placeholder={!photo} ratio="3/4" />}
        <ThreadLine />
      </div>
    </div>
  </section>;
}
export function FillWords({ items }: { items: Array<{ word: string; text: string }> }) {
  return <div className={styles.fillWords}>{items.map((item) => <div className={styles.fillWord} key={item.word}><strong>{item.word}</strong><span>{item.text}</span></div>)}</div>;
}

export function Ledger({ rows, emptyValue }: { rows: Array<{ label: string; value?: string; missing?: boolean }>; emptyValue: string }) {
  return <dl className={styles.ledger}>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.missing || !row.value ? 'tbc' : ''}>{row.value || emptyValue}</dd></div>)}</dl>;
}

export function VerticalSteps({ steps }: { steps: Array<{ title: string; text: string; art?: ReactNode }> }) {
  return <ol className={styles.verticalSteps}>{steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><div className={styles.stepArt}>{step.art}</div></li>)}</ol>;
}

export function SealLink({ href, label }: { href: string; label: string }) {
  return <a className={styles.seal} href={href} aria-label={label}><span aria-hidden="true">TAP TO CALL · TAP TO CALL ·</span><b aria-hidden="true">↗</b></a>;
}

export function ErrorDoor({ code, kind }: { code: string; kind: 'open' | 'shut' | 'frayed' }) {
  return <span className={`${styles.errorDoor} ${styles[`error-${kind}`]}`} aria-hidden="true">{code.slice(0, 1)}<i>{kind === 'open' ? '◖' : kind === 'shut' ? '▯' : '⌁'}</i>{code.slice(-1)}</span>;
}
