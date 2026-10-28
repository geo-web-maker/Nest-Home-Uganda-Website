import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-admin-native',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'admin-native.html') },
  },
  server: { host: '0.0.0.0' },
});
