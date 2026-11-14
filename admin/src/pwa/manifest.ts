export const manifest = {
  name: 'Bloomwell Home Care Uganda Admin',
  short_name: 'Nest Admin',
  description: 'Secure administration for Bloomwell Home Care Uganda.',
  start_url: '/mail',
  scope: '/',
  display: 'standalone',
  background_color: '#f6f7f4',
  theme_color: '#0B2E2A',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
} as const;
