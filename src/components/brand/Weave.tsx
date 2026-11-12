import styles from './Weave.module.css';

/** Full-width wave that sits flush under the home hero. Decorative. */
export function Weave() {
  return (
    <svg
      className={styles.weave}
      viewBox="0 0 1200 46"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className={styles.fill} d="M0 20c200 30 400 30 600 16S1000 6 1200 20v26H0z" />
      <path className={styles.stroke} d="M0 14c200 26 420 26 600 12s400-22 600-10" />
    </svg>
  );
}
