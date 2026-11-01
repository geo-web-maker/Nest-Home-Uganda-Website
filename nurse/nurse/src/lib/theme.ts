export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'nest-theme';
const THEME_COLORS: Record<Theme, string> = {
  light: '#123524',
  dark: '#091410',
};

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Read the explicit saved preference. System colour-scheme is deliberately ignored. */
export function getTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // Private browsing / storage policies may disable localStorage.
  }
  const applied = typeof document === 'undefined' ? null : document.documentElement.dataset.theme;
  return isTheme(applied ?? null) ? (applied as Theme) : 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[theme];
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The active page still changes theme even when persistence is unavailable.
  }
}

/** Apply a valid saved preference, otherwise choose light without consulting the OS. */
export function initTheme(): Theme {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
