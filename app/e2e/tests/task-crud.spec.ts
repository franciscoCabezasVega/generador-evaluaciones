import { test, expect } from '../fixtures';
import { generateRandomTask, generateEditedTask } from '../helpers';
import { AuditPage } from '../pages';

/**
 * E2E: Task CRUD with Audit Trail Verification
 *
 * Validates the complete lifecycle of a task using **random data** (faker)
 * to defeat the Pesticide Paradox — every execution uses different names,
 * product types, squads, devoluciones and statuses.
 *
 * After each CRUD action the test navigates to the Audit Trail page to
 * verify the action is correctly recorded. This keeps audit verification
 * inside the same test flow (no inter-test dependencies) while following
 * POM by delegating audit assertions to AuditPage.
 *
 * Flow:
 *  1. Create task with random data → verify in table → verify in audit
 *  2. Edit task (name + link) → verify in table → verify in audit
 *  3. Delete task → verify gone from table → verify in audit
 */
test.describe('Task CRUD with Audit', () => {
  test('should create, edit, delete a task and verify each action in audit trail', async ({
    authenticatedPage: tasksPage,
    navbar,
    page,
  }) => {
    // ── Generate random data ──────────────────────────────────
    const taskData = generateRandomTask({ status: 'Completada' });
    const editData = generateEditedTask();

    // Create AuditPage instance (shares page with other POMs)
    const auditPage = new AuditPage(page);

    // Log generated data for debugging (visible in Playwright trace)
    console.log('[CRUD Test] Random task data:', JSON.stringify({
      name: taskData.name,
      productType: taskData.productType,
      squads: taskData.squads,
      returns: taskData.returns,
      status: taskData.status,
      qaMembers: taskData.qaMembers,
      tshirtSize: taskData.tshirtSize,
      category: taskData.category,
      effortScoreDate: taskData.effortScoreDate,
    }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: CREATE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await test.step('Create a new task with random data', async () => {
      await tasksPage.openNewTaskForm();

      // Build squad payloads for the form
      const squadPayloads = taskData.squads.map((squadName, idx) => ({
        name: squadName,
        low: idx === 0 ? taskData.returns.low : 0,
        medium: idx === 0 ? taskData.returns.medium : 0,
        high: idx === 0 ? taskData.returns.high : 0,
        notes: idx === 0 ? taskData.notes : undefined,
      }));

      await tasksPage.fillTaskForm({
        name: taskData.name,
        link: taskData.link,
        productType: taskData.productType,
        squads: squadPayloads,
        status: taskData.status,
        category: taskData.category,
        tshirtSize: taskData.tshirtSize,
        effortScoreDate: taskData.effortScoreDate,
      });

      // Select QA members
      await tasksPage.selectQAMembers(taskData.qaMembers);

      await tasksPage.submitTaskForm();
    });

    await test.step('Verify task appears in table', async () => {
      await tasksPage.waitForTableLoaded();
      await tasksPage.expectTaskVisible(taskData.name);
    });

    await test.step('Verify CREATE is recorded in audit trail', async () => {
      await navbar.navigateTo('Auditoría');
      await page.waitForURL(/\/audit-trail/);
      await auditPage.expectLoaded();
      await auditPage.verifyTaskAuditRecord(taskData.name, 'Crear');

      // Return to tasks
      await navbar.navigateTo('Tareas');
      await page.waitForURL(/\/tasks/);
      await tasksPage.expectLoaded();
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: EDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await test.step('Edit the task — verify QA persisted, change name and link', async () => {
      await tasksPage.openEditForm(taskData.name);

      // Verify QA members were persisted from creation
      const selectedQA = await tasksPage.getSelectedQAChips();
      for (const qa of taskData.qaMembers) {
        expect(selectedQA).toContain(qa);
      }

      const nameInput = page.getByLabel('Nombre *');
      await nameInput.clear();
      await nameInput.fill(editData.name);

      const linkInput = page.getByLabel('Link *');
      await linkInput.clear();
      await linkInput.fill(editData.link);

      await tasksPage.submitTaskForm();
    });

    await test.step('Verify edited task appears in table', async () => {
      await tasksPage.waitForTableLoaded();
      await tasksPage.expectTaskVisible(editData.name);
      await tasksPage.expectTaskNotVisible(taskData.name);
    });

    await test.step('Verify UPDATE is recorded in audit trail', async () => {
      await navbar.navigateTo('Auditoría');
      await page.waitForURL(/\/audit-trail/);
      await auditPage.expectLoaded();
      await auditPage.verifyTaskAuditRecord(editData.name, 'Actualizar');

      // Return to tasks
      await navbar.navigateTo('Tareas');
      await page.waitForURL(/\/tasks/);
      await tasksPage.expectLoaded();
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: DELETE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await test.step('Delete the task', async () => {
      await tasksPage.deleteTask(editData.name);
    });

    await test.step('Verify task is removed from table', async () => {
      await tasksPage.waitForTableLoaded();
      await tasksPage.expectTaskNotVisible(editData.name);
    });

    await test.step('Verify DELETE is recorded in audit trail', async () => {
      await navbar.navigateTo('Auditoría');
      await page.waitForURL(/\/audit-trail/);
      await auditPage.expectLoaded();
      await auditPage.verifyTaskAuditRecord(editData.name, 'Eliminar');
    });
  });
});
