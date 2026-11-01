import { useState } from 'react';
import { copy } from '../copy';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';

export function ThemeSwitch() {
  const [theme, updateTheme] = useState<Theme>(() => getTheme());
  const choose = (next: Theme) => {
    setTheme(next);
    updateTheme(next);
  };
  return <Card className="theme-panel" aria-labelledby="theme-heading">
    <h3 id="theme-heading">{copy.theme.heading}</h3>
    <div className="theme-choice" role="group" aria-label={copy.theme.label}>
      <PillButton type="button" tone="ghost" size="sm" showArrow={false} aria-pressed={theme === 'light'} onClick={() => choose('light')}>{copy.theme.light}</PillButton>
      <PillButton type="button" tone="ghost" size="sm" showArrow={false} aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>{copy.theme.dark}</PillButton>
    </div>
  </Card>;
}
