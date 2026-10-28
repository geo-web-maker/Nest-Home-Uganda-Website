import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Serves the production build from ./dist (run `npm run build` first; CI does). The backend API is
// mocked inside the tests, so these tests need no database or storage.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Locally this uses the installed Google Chrome Beta; CI uses Playwright's bundled Chromium.
    // Override with PLAYWRIGHT_CHANNEL=<channel>, or set it to an empty string to force the bundled browser.
    channel: (process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : 'chrome-beta')) || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node e2e/static-server.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
