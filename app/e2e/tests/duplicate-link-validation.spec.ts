import { test, expect } from '../fixtures';
import { generateRandomTask, createTaskViaAPI, deleteTaskViaAPI } from '../helpers';

/**
 * E2E: Duplicate Link Validation
 *
 * Validates that the system prevents creating a task with a link that is
 * already in use by another task.
 *
 * The test arranges its own data via API (creates the "source" task with
 * a known link), then attempts to create a second task with that same link
 * through the UI, verifying the duplicate-link validation fires correctly.
 * The arranged task is cleaned up in afterEach.
 *
 * This test is fully independent — it does NOT depend on pre-existing data
 * in the database.
 *
 * Flow:
 *  1. Create a task with a known link via API (arrange)
 *  2. Open the "New Task" form and fill it using the same link
 *  3. Submit and verify the error message appears
 *  4. Verify the form remains open (task was NOT created)
 *  5. Cancel the form — afterEach cleans up the arranged task
 */
test.describe('Duplicate Link Validation', () => {
  let arrangedTaskId: string | undefined;
  let arrangedTaskLink: string | undefined;

  test.afterEach(async ({ page, request }) => {
    if (arrangedTaskId) {
      await deleteTaskViaAPI(page, request, arrangedTaskId);
      arrangedTaskId = undefined;
      arrangedTaskLink = undefined;
    }
  });

  test('should prevent creating a task with a link that already exists', async ({
    authenticatedPage: tasksPage,
    page,
    request,
  }) => {
    // ── Arrange: create a task with a known link via API ────────────────────
    await test.step('Create source task via API', async () => {
      const created = await createTaskViaAPI(page, request, { status: 'Completada' });
      arrangedTaskId = created.id;
      arrangedTaskLink = created.link;
    });

    // ── Act: attempt to create a second task with the same link ─────────────
    await test.step('Attempt to create a task with the duplicated link', async () => {
      await tasksPage.goto();
      await tasksPage.expectLoaded();

      const taskData = generateRandomTask({ status: 'Completada' });

      await tasksPage.openNewTaskForm();

      const squadPayloads = taskData.squads.map((squadName, idx) => ({
        name: squadName,
        low: idx === 0 ? taskData.returns.low : 0,
        medium: idx === 0 ? taskData.returns.medium : 0,
        high: idx === 0 ? taskData.returns.high : 0,
        notes: idx === 0 ? taskData.notes : undefined,
      }));

      await tasksPage.fillTaskForm({
        name: taskData.name,
        link: arrangedTaskLink!, // Re-use the link from the arranged task
        productType: taskData.productType,
        squads: squadPayloads,
        status: taskData.status,
        category: taskData.category,
        tshirtSize: taskData.tshirtSize,
        effortScoreDate: taskData.effortScoreDate,
      });

      await tasksPage.selectQAMembers(taskData.qaMembers);

      // Wait for the submit button to be enabled before clicking
      const saveButton = page.getByRole('button', { name: /Guardar Tarea/i });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      // Wait for the duplicate-link error message from the server
      await expect(
        page.getByText(/Este link ya existe en otra tarea/i),
      ).toBeVisible();
    });

    // ── Assert: verify error is shown and form stays open ───────────────────
    await test.step('Verify error message and form remain visible', async () => {
      await expect(page.getByText(/Este link ya existe en otra tarea/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Guardar Tarea/i })).toBeVisible();
    });

    // ── Cleanup: cancel the form (the arranged task is cleaned up in afterEach)
    await test.step('Cancel form without creating any record', async () => {
      await tasksPage.cancelTaskForm();

      // The form has unsaved data — the discard confirmation will appear
      const discardButton = page.getByRole('button', { name: /Descartar cambios/i });
      await expect(discardButton).toBeVisible();
      await discardButton.click();
    });
  });
});
