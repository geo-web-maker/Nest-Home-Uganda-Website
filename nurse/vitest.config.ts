import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// e2e/ holds Playwright specs; Vitest must not try to load them.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/test-stubs/pwa-register-react.ts', import.meta.url)) } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'], exclude: [...configDefaults.exclude, 'e2e/**'] },
});
