import { test, expect } from '../fixtures';

/**
 * E2E: Navigation between app tabs
 *
 * Validates that switching between all main sections via the
 * Navbar works correctly and data loads without skeleton issues.
 *
 * Covers: Tareas → Reportes → Tiempos → Auditoría → Tareas
 *
 * Best practices:
 * - Role-based selectors (getByRole)
 * - Explicit waits (toBeVisible/toBeHidden) instead of waitForFunction/waitForTimeout
 * - data-testid for non-semantic elements
 */
test.describe('Tab Navigation', () => {
  test('should navigate between all tabs and load content correctly', async ({
    authenticatedPage: tasksPage,
    navbar,
    page,
  }) => {
    // ── Start on Tasks ────────────────────────────────────────
    await test.step('Verify Tasks page is loaded', async () => {
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
      await navbar.expectActiveSection('Tareas');
    });

    // ── Navigate to Reports ───────────────────────────────────
    await test.step('Navigate to Reportes', async () => {
      await navbar.navigateTo('Reportes');
      await page.waitForURL(/\/reports/);
      await expect(
        page.getByRole('heading', { name: 'Reportes', level: 1 }),
      ).toBeVisible();
      // Wait for skeleton to be gone using data-testid
      await expect(page.getByTestId('skeleton-table')).toBeHidden();
      await navbar.expectActiveSection('Reportes');
    });

    // ── Navigate to Timings ───────────────────────────────────
    await test.step('Navigate to Tiempos', async () => {
      await navbar.navigateTo('Tiempos');
      await page.waitForURL(/\/timings/);
      await expect(
        page.getByRole('heading', { name: /Tiempos/i, level: 1 }),
      ).toBeVisible();
      await expect(page.getByTestId('skeleton-table')).toBeHidden();
      await navbar.expectActiveSection('Tiempos');
    });

    // ── Navigate to Audit Trail ───────────────────────────────
    await test.step('Navigate to Auditoría', async () => {
      await navbar.navigateTo('Auditoría');
      await page.waitForURL(/\/audit-trail/);
      await expect(
        page.getByRole('heading', { name: /Auditoría/i, level: 1 }),
      ).toBeVisible();
      await expect(page.getByTestId('skeleton-table')).toBeHidden();
      await navbar.expectActiveSection('Auditoría');
    });

    // ── Return to Tasks ───────────────────────────────────────
    await test.step('Return to Tareas and verify data persists', async () => {
      await navbar.navigateTo('Tareas');
      await page.waitForURL(/\/tasks/);
      await tasksPage.expectLoaded();
      await tasksPage.expectNoSkeleton();
      await tasksPage.expectTableHasContent();
    });
  });
});
