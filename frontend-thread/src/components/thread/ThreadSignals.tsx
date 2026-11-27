import { useId } from 'react';
import styles from './ThreadParts.module.css';

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
