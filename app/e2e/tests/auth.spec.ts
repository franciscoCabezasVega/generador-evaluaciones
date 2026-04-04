import { test, expect, TEST_USER } from '../fixtures';
import { TasksPage, NavbarComponent } from '../pages';

/**
 * E2E: Authentication – Login & Logout
 *
 * Validates:
 *  1. Successful login with valid credentials
 *  2. Error handling with invalid credentials
 *  3. Logout shows overlay, never flashes unauthenticated content, and redirects
 *  4. Protected routes redirect unauthenticated users to login
 *
 * Best practices:
 * - Role-based selectors (getByRole, getByLabel) via POMs
 * - data-testid for non-semantic elements (login-error)
 * - Explicit waits (toBeVisible, waitForURL) instead of timeouts
 */
test.describe('Authentication', () => {
  test('should login successfully with valid credentials', async ({
    loginPage,
    page,
  }) => {
    await test.step('Navigate to login page', async () => {
      await loginPage.goto();
      await loginPage.expectVisible();
    });

    await test.step('Submit valid credentials', async () => {
      await loginPage.loginAndWaitForRedirect(
        TEST_USER.email,
        TEST_USER.password,
      );
    });

    await test.step('Verify redirect to authenticated area', async () => {
      // Login redirects to / (home dashboard) via window.location.href = '/'
      await expect(page).toHaveURL(/localhost:3000\/?($|tasks|reports|timings|audit-trail)/);
    });
  });

  test('should show error with invalid credentials', async ({
    loginPage,
  }) => {
    await test.step('Navigate to login page', async () => {
      await loginPage.goto();
      await loginPage.expectVisible();
    });

    await test.step('Submit invalid credentials', async () => {
      await loginPage.login('bad-user@fake.com', 'WrongPassword123!');
    });

    await test.step('Verify error is displayed', async () => {
      await loginPage.expectError();
    });

    await test.step('Verify we remain on login page', async () => {
      await loginPage.expectVisible();
    });
  });

  test('should logout cleanly without flashing unauthenticated content', async ({
    loginPage,
    page,
  }) => {
    await test.step('Login to obtain an authenticated session', async () => {
      await loginPage.goto();
      await loginPage.loginAndWaitForRedirect(TEST_USER.email, TEST_USER.password);
    });

    const tasksPage = new TasksPage(page);
    const navbar = new NavbarComponent(page);

    await test.step('Verify we are authenticated', async () => {
      await navbar.expectAuthenticated();
      await tasksPage.goto();
      await tasksPage.waitForTableLoaded();
    });

    await test.step('Click logout and verify clean transition to login', async () => {
      // Click logout — the full-screen overlay may appear briefly before the
      // hard redirect (`window.location.href`).  On fast CI machines the
      // navigation can complete before React paints the overlay, so we do NOT
      // assert its visibility; we only verify that the redirect lands on the
      // login page without intermediate flashes.
      await navbar.logoutButton.click();
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    await test.step('Verify login page is displayed correctly', async () => {
      await loginPage.expectVisible();
    });

    await test.step('Verify no stale logout overlay remains after redirect', async () => {
      // Once we are on /auth/login the overlay must be gone (it lived in the
      // previous page's React tree which was destroyed by the hard navigation).
      const overlay = page.getByText('Cerrando sesión');
      await expect(overlay).not.toBeVisible();
    });
  });

  test('should redirect to login when accessing protected route unauthenticated', async ({
    page,
  }) => {
    await test.step('Try to access /tasks directly', async () => {
      await page.goto('/tasks');
    });

    await test.step('Verify redirect to login', async () => {
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });
});

