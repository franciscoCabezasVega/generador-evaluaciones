import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { config } from 'dotenv';

/**
 * Load environment variables from .env.local
 * This makes E2E_USER_EMAIL / E2E_USER_PASSWORD available to fixtures.
 * @see https://playwright.dev/docs/test-parameterize#env-files
 */
config({ path: path.resolve(__dirname, '.env.local'), quiet: true });

/**
 * Playwright E2E Configuration
 *
 * - Chromium only (as requested)
 * - Full viewport (1920x1080)
 * - Auto-starts dev server on port 3000
 *
 * ⚠️ TIMEOUT STRATEGY - Centralized Global Timeouts
 * All tests and Page Objects use ONLY the global timeouts defined below.
 * NO hardcoded timeouts in individual tests or assertions.
 *
 * This ensures:
 * ✓ Consistency across all tests
 * ✓ Easy maintenance — change once, affects all
 * ✓ Less noise in test code
 * ✓ Implicit waits handle most scenarios automatically
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential to avoid auth conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 }, // Aumentado para acomodar stagger delays + fetch time

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: ['--start-maximized'],
        },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 60_000,
  },
});
