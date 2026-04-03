import { test, expect } from '../fixtures';

/**
 * E2E: Browser Tab Visibility – Session Stability
 *
 * Validates that the application remains stable when the user:
 *  1. Switches between app tabs (Tareas → Reportes → back)
 *  2. Opens a new browser tab, interacts with it, and returns
 *  3. The app does NOT show skeleton or reload unexpectedly
 *
 * This test specifically targets the "visibilitychange" and
 * localStorage cache expiry issues that caused skeleton flashing.
 *
 * Best practices:
 * - Explicit waits (toBeVisible/toBeHidden) instead of waitForTimeout/waitForFunction
 * - Role-based and data-testid selectors
 */
test.describe('Browser Tab Visibility', () => {
  test('should remain stable after switching tabs and opening new browser tabs', async ({
    authenticatedPage: tasksPage,
    navbar,
    page,
  }) => {
    // ── Step 1: Verify initial state ──────────────────────────
    await test.step('Initial state is loaded', async () => {
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
    });

    // ── Step 2: Navigate between app tabs ─────────────────────
    await test.step('Switch to Reportes and back to Tareas', async () => {
      await navbar.navigateTo('Reportes');
      await page.waitForURL(/\/reports/);
      // Wait for skeleton to disappear using data-testid
      await expect(page.getByTestId('skeleton-table')).toBeHidden();

      await navbar.navigateTo('Tareas');
      await page.waitForURL(/\/tasks/);
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
    });

    // ── Step 3: Open a new browser tab, switch away, and return
    await test.step('Open new browser tab, switch away and return', async () => {
      const context = page.context();

      // Open a brand new tab
      const newTab = await context.newPage();
      await newTab.goto('https://example.com');
      await expect(newTab.getByRole('heading', { name: /Example Domain/i })).toBeVisible();

      // Close the new tab and return to the original
      await newTab.close();

      // Bring original page to front
      await page.bringToFront();

      // ── Assert the app is still fully loaded, no skeleton ──
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
      await tasksPage.expectTableHasContent();
      await navbar.expectAuthenticated();
    });

    // ── Step 4: Navigate away from app, wait, come back ───────
    await test.step('Navigate away in same tab and come back', async () => {
      // Navigate to an external page
      await page.goto('https://example.com');
      await expect(page.getByRole('heading', { name: /Example Domain/i })).toBeVisible();

      // Go back to the app
      await tasksPage.goto();
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
      await tasksPage.expectTableHasContent();
    });

    // ── Step 5: Multiple rapid tab switches ───────────────────
    await test.step('Rapid tab switches remain stable', async () => {
      const context = page.context();

      // Rapid switches: open tab, switch, close, repeat 3 times
      for (let i = 0; i < 3; i++) {
        const tab = await context.newPage();
        await tab.goto('https://example.com');
        await expect(tab.getByRole('heading', { name: /Example Domain/i })).toBeVisible();
        await tab.close();
        await page.bringToFront();
      }

      // App must still be stable
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
      await navbar.expectAuthenticated();
    });
  });
});
