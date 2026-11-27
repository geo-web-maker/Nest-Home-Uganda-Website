import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScrollVars } from '../../hooks/useScrollVars';
import { cx } from '../../lib/cx';
import styles from './ThreadParts.module.css';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

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
 * VerticalSteps: the gold line fills and the Bloomwell mark travels as you scroll.
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
