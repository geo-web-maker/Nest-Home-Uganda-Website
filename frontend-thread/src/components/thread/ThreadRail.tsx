import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import styles from './ThreadParts.module.css';

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
