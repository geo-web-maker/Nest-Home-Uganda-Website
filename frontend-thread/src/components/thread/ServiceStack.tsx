import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './ServiceStack.module.css';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/**
 * ServiceStack: vertical scroll of service cards. Each card pins under the header as the next one
 * slides over it (CSS sticky). Once hydrated, cards fade up as they arrive and the card underneath
 * shrinks slightly. Pre-render, no JS and reduced motion all show the plain finished stack.
 */
export function ServiceStack({ head, children }: { head: ReactNode; children: ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cards = Array.from(list.children) as HTMLElement[];
    setEnhanced(true);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const card = entry.target as HTMLElement;
          const index = cards.indexOf(card);
          const shown = styles.in;
          window.setTimeout(() => { if (shown) card.classList.add(shown); }, (index % 2) * 90);
          io.unobserve(card);
        });
      },
      { threshold: 0.15 },
    );
    cards.forEach((card) => io.observe(card));

    let frame = 0;
    const update = () => {
      frame = 0;
      const cols = getComputedStyle(list).gridTemplateColumns.split(' ').length;
      cards.forEach((card, i) => {
        const next = cards[i + cols];
        if (!next) return void card.style.setProperty('--s', '1');
        const gap = next.getBoundingClientRect().top - card.getBoundingClientRect().top;
        const p = Math.max(0, Math.min(1, 1 - gap / (card.offsetHeight + 18)));
        card.style.setProperty('--s', (1 - p * 0.05).toFixed(3));
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="container">
      <div className={styles.head}>{head}</div>
      <ul ref={listRef} className={cx(styles.stack, enhanced && styles.enhanced)}>
        {children}
      </ul>
    </div>
  );
}

export function StackCard({
  index,
  number,
  title,
  summary,
  href,
  photo,
  tone = 'f',
}: {
  index: number;
  number: string | number;
  title: string;
  summary: string;
  href: string;
  photo?: string | null;
  tone?: 'f' | 's' | 'l' | 'w';
}) {
  return (
    <li className={cx(styles.card, styles[`tone-${tone}`])} style={{ ['--i' as string]: index, ['--row' as string]: Math.floor(index / 2) }}>
      <span className={cx(styles.photo, !photo && styles.photoNone)} aria-hidden="true">
        {photo && <img src={photo} alt="" loading="lazy" decoding="async" />}
      </span>
      <div className={styles.text}>
        <h3>
          <Link to={href} className={styles.link}>{title}</Link>
        </h3>
        <p>{summary}</p>
      </div>
      <span className={styles.number} aria-hidden="true">{String(number).padStart(2, '0')}</span>
    </li>
  );
}
