import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { config } from 'dotenv';

/**
 * Load environment variables from .env.local
 * This makes E2E_USER_EMAIL / E2E_USER_PASSWORD available to fixtures.
 * @see https://playwright.dev/docs/test-parameterize#env-files
 */
config({ path: path.resolve(__dirname, '.env.local'), quiet: true });

/** Path where the auth setup project persists the session */
const AUTH_STATE_FILE = path.join(__dirname, '.auth/user.json');

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
 *
 * ── Auth Strategy ───────────────────────────────────────────────────────────
 * A dedicated `setup` project logs in once and persists the session to
 * `.auth/user.json`.  The `chromium` project declares it as a dependency so
 * every browser context starts already authenticated via storageState.
 *
 * Only `auth.spec.ts` is excluded from this — it tests the login flow itself
 * and therefore must run without a pre-loaded session.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  testDir: './e2e',
  // Tests are now independent — each one arranges its own data via API helpers.
  // storageState removes auth contention so parallel execution is safe.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Limit workers to avoid overwhelming the dev server with parallel API calls
  workers: process.env.CI ? 2 : 3,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  globalTeardown: './e2e/setup/global-teardown.ts',

  projects: [
    // ── Setup project: runs once before all tests ──────────────
    {
      name: 'setup',
      testMatch: /setup\/auth\.setup\.ts/,
    },

    // ── Auth tests: excluded from setup dependency (tests login itself) ──
    {
      name: 'auth',
      testMatch: /tests\/auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--start-maximized'] },
      },
    },

    // ── Main tests: depend on setup (pre-authenticated via storageState) ──
    {
      name: 'chromium',
      testIgnore: /tests\/auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--start-maximized'] },
        storageState: AUTH_STATE_FILE,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 60_000,
  },
});
