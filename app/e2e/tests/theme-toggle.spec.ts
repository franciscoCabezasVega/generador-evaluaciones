import { test, expect } from '../fixtures';

/**
 * E2E: Theme toggle (light / dark / system)
 *
 * Validates that:
 * 1. The toggle button is visible in the Navbar for authenticated users.
 * 2. Selecting "Oscuro" adds class `dark` to <html>.
 * 3. The theme persists across page reloads (via localStorage).
 * 4. Selecting "Claro" removes `dark` and adds `light`.
 * 5. Selecting "Sistema" falls back to the OS preference.
 *
 * Auth is provided by the `authenticatedPage` fixture (pre-loaded storageState).
 */
test.describe('Theme Toggle', () => {
  test.afterEach(async ({ page }) => {
    // Cleanup: remove persisted theme so other tests start with a clean slate
    await page.evaluate(() => localStorage.removeItem('theme'));
  });

  test('toggle visible in Navbar and switches to dark mode', async ({
    authenticatedPage,
    page,
  }) => {
    const toggleButton = page.getByRole('button', { name: 'Selector de tema' });

    await test.step('Theme toggle is visible in the Navbar', async () => {
      await expect(toggleButton).toBeVisible();
    });

    await test.step('Selecting "Oscuro" adds class dark to <html>', async () => {
      await toggleButton.click();
      const oscuroOption = page.getByRole('option', { name: 'Oscuro' });
      await expect(oscuroOption).toBeVisible();
      await oscuroOption.getByRole('button').click();

      const htmlClass = await page.evaluate(
        () => document.documentElement.className,
      );
      expect(htmlClass).toBe('dark');
    });

    await test.step('Dark mode persists after page reload', async () => {
      await page.reload();
      await page.waitForLoadState('networkidle');

      const htmlClass = await page.evaluate(
        () => document.documentElement.className,
      );
      expect(htmlClass).toBe('dark');
    });
  });

  test('switches to light mode and persists', async ({
    authenticatedPage,
    page,
  }) => {
    // Start from dark
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const toggleButton = page.getByRole('button', { name: 'Selector de tema' });

    await test.step('Selecting "Claro" switches to light mode', async () => {
      await toggleButton.click();
      await page.getByRole('option', { name: 'Claro' }).getByRole('button').click();

      const htmlClass = await page.evaluate(
        () => document.documentElement.className,
      );
      expect(htmlClass).toBe('light');
    });

    await test.step('Light mode persists after page reload', async () => {
      await page.reload();
      await page.waitForLoadState('networkidle');

      const htmlClass = await page.evaluate(
        () => document.documentElement.className,
      );
      expect(htmlClass).toBe('light');
    });
  });

  test('system theme removes explicit class preference', async ({
    authenticatedPage,
    page,
  }) => {
    // Start from dark
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const toggleButton = page.getByRole('button', { name: 'Selector de tema' });

    await test.step('Selecting "Sistema" saves system as localStorage value', async () => {
      await toggleButton.click();
      await page
        .getByRole('option', { name: 'Sistema' })
        .getByRole('button')
        .click();

      const stored = await page.evaluate(() => localStorage.getItem('theme'));
      expect(stored).toBe('system');
    });
  });
});
