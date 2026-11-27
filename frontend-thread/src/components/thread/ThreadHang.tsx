import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useInViewOnce } from '../../hooks/useInViewOnce';
import { cx } from '../../lib/cx';
import { Arch } from './ThreadDecorations';
import styles from './ThreadParts.module.css';

/* ---------------------------------------------------------------------------------------------
 * Hang: arches hung from a gold thread that draws itself, then sway gently. Pre-render and
 * reduced motion show the finished picture.
 * ------------------------------------------------------------------------------------------- */
export function Hang({ items, label }: { items: Array<{ title: string; caption: string; href: string; photo?: string | null; alt?: string }>; label: string }) {
  const [ref, state] = useInViewOnce<HTMLDivElement>(0.3);
  const listRef = useRef<HTMLUListElement>(null);
  const [line, setLine] = useState<{ w: number; d: string } | null>(null);

  // Draw the wave through the real hanger positions. The columns have gaps, so a fixed 0-1000 curve
  // drifts off the hangers (they sat on the slope, not on the line). Measured again on resize.
  useEffect(() => {
    const wrap = ref.current;
    const list = listRef.current;
    if (!wrap || !list || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const stops = Array.from(list.children).map((li) => list.offsetLeft + (li as HTMLElement).offsetLeft + (li as HTMLElement).offsetWidth / 2);
      const first = stops[0];
      const second = stops[1];
      if (first === undefined || second === undefined || !wrap.clientWidth) return;
      const half = (second - first) / 2;
      const x0 = first - half;
      let d = `M${x0.toFixed(1)} 60 Q ${(x0 + half / 2).toFixed(1)} 20 ${(x0 + half).toFixed(1)} 60`;
      for (let k = 2; k <= stops.length * 2; k += 1) d += ` T ${(x0 + k * half).toFixed(1)} 60`;
      setLine((current) => (current && current.d === d ? current : { w: wrap.clientWidth, d }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [ref, items.length]);

  return (
    <div ref={ref} className={styles.hang} data-state={state}>
      <svg className={styles.hangLine} viewBox={line ? `0 0 ${line.w} 120` : '0 0 1000 120'} preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d={line ? line.d : 'M0 60 Q 83 20 167 60 T 333 60 T 500 60 T 667 60 T 833 60 T 1000 60'} />
      </svg>
      <ul ref={listRef} className={styles.hangList} aria-label={label}>
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
