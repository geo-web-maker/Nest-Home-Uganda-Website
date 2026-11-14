import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './src/pwa/manifest';

function headersPlugin(apiUrl: string, mailStorageUrl: string): Plugin {
  return {
    name: 'admin-headers',
    apply: 'build',
    closeBundle() {
      let apiOrigin = '';
      let storageOrigin = '';
      try { apiOrigin = apiUrl ? new URL(apiUrl).origin : ''; } catch { /* invalid/missing API override */ }
      try {
        const storage = mailStorageUrl ? new URL(mailStorageUrl) : null;
        if (storage?.protocol === 'https:') storageOrigin = storage.origin;
      } catch { /* invalid/missing storage override */ }
      if (!storageOrigin) console.warn('[admin-headers] VITE_MAIL_STORAGE_URL is missing or not https; mail attachment uploads may be blocked by CSP.');
      const connect = ["'self'", apiOrigin, storageOrigin, 'https://api.cloudinary.com'].filter(Boolean).join(' ');
      // The pre-paint theme script in index.html is inline; allow exactly that script by hash instead of 'unsafe-inline'.
      const html = readFileSync('dist/index.html', 'utf8');
      const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}'`);
      const scriptSrc = ["'self'", ...hashes].join(' ');
      const csp = `default-src 'self'; script-src ${scriptSrc}; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src ${connect}; frame-ancestors 'none'`;
      writeFileSync('dist/_headers', `/*\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-cache\n\n/sw.js\n  Cache-Control: no-cache\n\n/index.html\n  Cache-Control: no-cache\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      headersPlugin(env.VITE_API_URL ?? '', env.VITE_MAIL_STORAGE_URL ?? ''),
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        // InstallHint owns registration and the explicit update action.
        injectRegister: null,
        manifest,
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/_shared', import.meta.url)),
      },
    },
    define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36).slice(-4)) },
    server: { host: '0.0.0.0', port: 5175 },
    test: {
      environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx,mjs}'], css: false,
    },
  };
});
