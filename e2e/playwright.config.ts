import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the web app against a running stack: `docker compose up` with
 * RATE_LIMIT=false (docs/development.md). E2E_BASE_URL points them at another URL.
 */
export default defineConfig({
  testDir: './tests',
  // One shared server: tests create their own users, but run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:9292',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
