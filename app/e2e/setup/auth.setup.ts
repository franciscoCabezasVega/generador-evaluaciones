import { test as setup } from '@playwright/test';
import path from 'path';

export const AUTH_STATE_FILE = path.join(__dirname, '../../.auth/user.json');

/**
 * Auth Setup — runs once before all test projects.
 *
 * Performs a real UI login and persists the browser storageState
 * (localStorage + cookies) to `.auth/user.json`.
 *
 * Every test that uses `storageState: AUTH_STATE_FILE` loads this
 * pre-authenticated state instead of repeating the login flow,
 * which:
 *  - Eliminates ~3-5s of login overhead per test
 *  - Enables fullyParallel execution (no auth race conditions)
 *  - Keeps auth.spec.ts as the single place that tests login itself
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/auth/login');

  await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel('Contraseña').fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar Sesión/i }).click();

  // Wait until we are redirected away from the login page
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
    timeout: 30_000,
  });

  // Persist the authenticated session to disk
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
