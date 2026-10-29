import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import styles from './ThemeSwitch.module.css';

type ThemeSwitchProps = {
  label: string;
  lightLabel: string;
  darkLabel: string;
  compact?: boolean;
  inverse?: boolean;
};

/** Explicit light/dark preference. Does not follow OS colour-scheme changes. */
export function ThemeSwitch({
  label,
  lightLabel,
  darkLabel,
  compact = false,
  inverse = false,
}: ThemeSwitchProps) {
  const [theme, updateTheme] = useState<Theme>(() => getTheme());
  const choose = (next: Theme) => {
    setTheme(next);
    updateTheme(next);
  };

  return (
    <div
      className={`${styles.switch} ${compact ? styles.compact : ''} ${inverse ? styles.inverse : ''}`}
      role="group"
      aria-label={label}
    >
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.option}
        aria-pressed={theme === 'light'}
        onClick={() => choose('light')}
      >
        {lightLabel}
      </button>
      <button
        type="button"
        className={styles.option}
        aria-pressed={theme === 'dark'}
        onClick={() => choose('dark')}
      >
        {darkLabel}
      </button>
    </div>
  );
}
