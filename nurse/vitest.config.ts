import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// e2e/ holds Playwright specs; Vitest must not try to load them.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, exclude: [...configDefaults.exclude, 'e2e/**'] },
});
