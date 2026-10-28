import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: (process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : 'chrome-beta')) || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'admin-native-mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `node e2e/static-server.mjs dist-admin-native ${PORT} admin-native.html`,
    url: `http://127.0.0.1:${PORT}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
