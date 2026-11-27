import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import styles from './ThemeSwitch.module.css';

type ThemeSwitchProps = {
  /** Visible text beside the icon on wide layouts; also the group name for assistive tech. */
  label: string;
  lightLabel: string;
  darkLabel: string;
  compact?: boolean;
  inverse?: boolean;
};

/**
 * One icon button for the explicit light/dark preference: the moon turns dark on, the sun turns it off.
 * The accessible name is the mode it switches to; aria-pressed says whether dark is on.
 * Does not follow OS colour-scheme changes.
 */
export function ThemeSwitch({
  label,
  lightLabel,
  darkLabel,
  compact = false,
  inverse = false,
}: ThemeSwitchProps) {
  const [theme, updateTheme] = useState<Theme>(() => getTheme());
  const dark = theme === 'dark';
  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    setTheme(next);
    updateTheme(next);
  };

  return (
    <button
      type="button"
      className={`${styles.switch} ${compact ? styles.compact : ''} ${inverse ? styles.inverse : ''}`}
      aria-label={`${label}: ${dark ? lightLabel : darkLabel}`}
      aria-pressed={dark}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
      <span className={styles.text}>{dark ? darkLabel : lightLabel}</span>
    </button>
  );
}
