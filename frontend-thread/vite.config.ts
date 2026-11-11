import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';

/** Review copies are explicitly noindexed; ordinary builds stay searchable by default. */
function reviewNoIndex(enabled: boolean): Plugin {
  return {
    name: 'thread-review-noindex',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!enabled || /<meta\s+name=["']robots["']/i.test(html)) return html;
        return html.replace(/<head([^>]*)>/i, '$&\n    <meta name="robots" content="noindex, nofollow" />');
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [reviewNoIndex(env.VITE_NOINDEX === 'true'), react()],
    // Short id of this build, shown in the client support reference to spot a cached old copy.
    define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36).slice(-4)) },
    ssgOptions: { dirStyle: 'nested' },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
