import { useState } from 'react';
import { copy } from '../copy';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export function ThemeSwitch() {
  const [theme, updateTheme] = useState<Theme>(() => getTheme());
  const choose = (next: Theme) => {
    setTheme(next);
    updateTheme(next);
  };
  return <section className="panel theme-panel" aria-labelledby="theme-heading">
    <h3 id="theme-heading">{copy.theme.heading}</h3>
    <div className="theme-choice" role="group" aria-label={copy.theme.label}>
      <button type="button" className="button-secondary" aria-pressed={theme === 'light'} onClick={() => choose('light')}>{copy.theme.light}</button>
      <button type="button" className="button-secondary" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>{copy.theme.dark}</button>
    </div>
  </section>;
}
