import { writeFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './src/pwa/manifest';

/** Writes dist/_headers so connect-src also allows the API origin chosen at build time. */
function headersPlugin(apiUrl: string): Plugin {
  return {
    name: 'nurse-headers',
    apply: 'build',
    closeBundle() {
      let origin = '';
      try { origin = apiUrl ? new URL(apiUrl).origin : ''; } catch { /* ignore a bad value */ }
      const connect = ["'self'", origin, 'https://api.cloudinary.com'].filter(Boolean).join(' ');
      const csp = `default-src 'self'; img-src 'self' data: blob:; connect-src ${connect}; frame-ancestors 'none'`;
      writeFileSync('dist/_headers', `/*\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    headersPlugin(env.VITE_API_URL ?? ''),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon-180.png', 'icons/icon.svg'],
      manifest,
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  server: { host: '0.0.0.0' },
};
});
