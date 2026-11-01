import { copy } from '../copy';

/**
 * Single source of truth for the nurse PWA manifest. vite.config.ts passes it to vite-plugin-pwa,
 * which emits /manifest.webmanifest and injects the <link rel="manifest"> tag. Do not add a
 * public/manifest.webmanifest or a manual <link> in index.html.
 *
 * Colours come from design/tokens.json (color.light.forest and color.light.bg). A test keeps them
 * in sync.
 */
export const THEME_COLOR = '#123524';
export const BACKGROUND_COLOR = '#F3F8F1';

export const manifest = {
  name: copy.appName,
  short_name: copy.appShortName,
  description: copy.manifestDescription,
  lang: 'en',
  start_url: '/',
  scope: '/',
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  background_color: BACKGROUND_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' as const },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
  ],
};
