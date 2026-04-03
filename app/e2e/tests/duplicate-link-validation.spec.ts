import { test, expect } from '../fixtures';
import { generateRandomTask } from '../helpers';

/**
 * E2E: Duplicate Link Validation
 *
 * Validates that the system prevents creating a task with a link that is
 * already in use by another task.
 *
 * This test does NOT create any records. It reads an existing task's link
 * from the table and attempts to create a new task with that same link,
 * verifying the duplicate-link validation fires correctly.
 *
 * Smart month resolution:
 *  - First checks the current month for existing tasks.
 *  - If none found, falls back to the previous month.
 *  - If neither month has tasks, the test is skipped gracefully.
 *
 * Flow:
 *  1. Find a month (current or previous) that has at least one task with a link
 *  2. Extract the link from that existing task
 *  3. Open the "New Task" form and fill it using the duplicated link
 *  4. Submit and verify the error message appears
 *  5. Verify the form remains open (task was NOT created)
 *  6. Cancel the form to leave the system unchanged
 */

/**
 * Returns { month, year } for the month before the given one,
 * handling the December → January year rollback.
 */
function getPreviousMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

test.describe('Duplicate Link Validation', () => {
  test('should prevent creating a task with a link that already exists', async ({
    authenticatedPage: tasksPage,
    page,
  }) => {
    let existingLink: string | null = null;

    // ── Step 1: Find an existing task link (current month → previous month → skip)
    await test.step('Find an existing task with a link', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const prev = getPreviousMonth(currentMonth, currentYear);

      const monthsToTry = [
        { month: currentMonth, year: currentYear, label: 'mes actual' },
        { month: prev.month, year: prev.year, label: 'mes anterior' },
      ];

      for (const { month, year, label } of monthsToTry) {
        // Navigate to /tasks with the specific month/year filter
        await page.goto(`/tasks?month=${month}&year=${year}`);
        await tasksPage.heading.waitFor({ state: 'visible' });
        await tasksPage.waitForTableLoaded();

        // Wait for rows to load from Supabase
        const rows = tasksPage.taskTable.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          // Now try to find a link in the first row
          const firstRowLink = rows.first().locator('a[href]');
          const linkVisible = await firstRowLink.isVisible().catch(() => false);
          
          if (linkVisible) {
            existingLink = await firstRowLink.getAttribute('href');
            console.log(`✔ Tarea encontrada en ${label} (${month}/${year}): ${existingLink}`);
            break;
          }
        }
        console.log(`⚠ Sin tareas con link en ${label} (${month}/${year}), probando siguiente…`);
      }

      // If no tasks found in either month, skip the test
      test.skip(
        !existingLink,
        'No se encontraron tareas con link en el mes actual ni en el anterior. Skipping.',
      );
    });

    // ── Step 2: Attempt to create a new task using the duplicated link
    await test.step('Attempt to create a task with the duplicated link', async () => {
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
        link: existingLink!, // Use the link that already exists in DB
        productType: taskData.productType,
        squads: squadPayloads,
        status: taskData.status,
        category: taskData.category,
        tshirtSize: taskData.tshirtSize,
        effortScoreDate: taskData.effortScoreDate,
      });

      // Select QA members
      await tasksPage.selectQAMembers(taskData.qaMembers);

      // Attempt to submit — should fail with duplicate link error
      const saveButton = page.getByRole('button', { name: /Guardar Tarea/i });
      
      // Wait for button to be enabled (or proceed if it's already enabled)
      try {
        await expect(saveButton).toBeEnabled();
      } catch {
        console.warn('Save button is still disabled; attempting anyway');
      }
      
      await saveButton.click({ force: true });

      // Wait for the duplicate-link error message
      await expect(
        page.getByText(/Este link ya existe en otra tarea/i),
      ).toBeVisible();
    });

    // ── Step 3: Verify the error is shown and the form stays open
    await test.step('Verify error message and form remain visible', async () => {
      const errorMessage = page.getByText(/Este link ya existe en otra tarea/i);
      await expect(errorMessage).toBeVisible();

      const saveButton = page.getByRole('button', { name: /Guardar Tarea/i });
      await expect(saveButton).toBeVisible();
    });

    // ── Step 4: Cancel the form to leave the system unchanged
    await test.step('Cancel form to avoid creating any record', async () => {
      await tasksPage.cancelTaskForm();

      // The form always has unsaved changes (filled in step 2), so the
      // confirmation dialog will appear. Wait for it explicitly.
      const discardButton = page.getByRole('button', { name: /Descartar cambios/i });
      await expect(discardButton).toBeVisible();
      await discardButton.click();

      await expect(tasksPage.formDialog).toBeHidden();
    });
  });
});
