import { test, expect } from '../fixtures';
import { generateRandomTask, generateEditedTask, createTaskViaAPI, deleteTaskViaAPI } from '../helpers';
import { AuditPage } from '../pages';

/**
 * E2E: Task CRUD with Audit Trail — Three Independent Tests
 *
 * Each test is fully self-contained:
 *  - CREATE test: creates via UI → verifies in table + audit → cleans up via API
 *  - UPDATE test: arranges via API → edits via UI → verifies + cleans up via API
 *  - DELETE test: arranges via API → deletes via UI → verifies in audit
 *
 * All tests use random faker data (Pesticide Paradox prevention).
 * afterEach blocks guarantee cleanup even when a test fails mid-way.
 */
test.describe('Task CRUD with Audit', () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST 1: CREATE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test.describe('CREATE', () => {
    let createdTaskId: string | undefined;

    test.afterEach(async ({ page, request }) => {
      // Guarantee cleanup even if the test body throws
      if (createdTaskId) {
        await deleteTaskViaAPI(page, request, createdTaskId);
        createdTaskId = undefined;
      }
    });

    test('should create a task via UI and record it in the audit trail', async ({
      authenticatedPage: tasksPage,
      navbar,
      page,
    }) => {
      const taskData = generateRandomTask({ status: 'Completada' });
      const auditPage = new AuditPage(page);

      await test.step('Open new task form and fill it', async () => {
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
          link: taskData.link,
          productType: taskData.productType,
          squads: squadPayloads,
          status: taskData.status,
          category: taskData.category,
          tshirtSize: taskData.tshirtSize,
          effortScoreDate: taskData.effortScoreDate,
        });

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
      });

      // Capture the task id for afterEach cleanup
      // We navigate back to tasks to find the id via the UI (or we can skip this
      // since the global teardown cleans "E2E " prefixed tasks anyway).
      // afterEach will call deleteTaskViaAPI if createdTaskId is set.
      // Since we don't have the id from the UI purely, we rely on global teardown here.
      // The afterEach guard is still here for explicitness when id is available.
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST 2: UPDATE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test.describe('UPDATE', () => {
    let arrangedTaskId: string | undefined;

    test.afterEach(async ({ page, request }) => {
      if (arrangedTaskId) {
        await deleteTaskViaAPI(page, request, arrangedTaskId);
        arrangedTaskId = undefined;
      }
    });

    test('should edit a task via UI and record the change in the audit trail', async ({
      authenticatedPage: tasksPage,
      navbar,
      page,
      request,
    }) => {
      // ── Arrange: create task via API so this test is independent of CREATE ──
      const created = await createTaskViaAPI(page, request, { status: 'Completada' });
      arrangedTaskId = created.id;
      const editData = generateEditedTask();
      const auditPage = new AuditPage(page);

      await test.step('Reload tasks page to show the arranged task', async () => {
        await tasksPage.goto();
        await tasksPage.expectLoaded();
        await tasksPage.waitForTableLoaded();
        await tasksPage.expectTaskVisible(created.name);
      });

      await test.step('Edit task name and link', async () => {
        await tasksPage.openEditForm(created.name);

        // Verify QA members were persisted from creation
        const selectedQA = await tasksPage.getSelectedQAChips();
        expect(selectedQA.length).toBeGreaterThan(0);

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
        await tasksPage.expectTaskNotVisible(created.name);
      });

      await test.step('Verify UPDATE is recorded in audit trail', async () => {
        await navbar.navigateTo('Auditoría');
        await page.waitForURL(/\/audit-trail/);
        await auditPage.expectLoaded();
        await auditPage.verifyTaskAuditRecord(editData.name, 'Actualizar');
      });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST 3: DELETE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test.describe('DELETE', () => {
    // No afterEach cleanup needed: the test itself deletes the task via UI.
    // Global teardown handles any leftover "E2E " tasks in case of failure.

    test('should delete a task via UI and record it in the audit trail', async ({
      authenticatedPage: tasksPage,
      navbar,
      page,
      request,
    }) => {
      // ── Arrange: create task via API ──
      const created = await createTaskViaAPI(page, request, { status: 'Completada' });
      const auditPage = new AuditPage(page);

      await test.step('Reload tasks page to show the arranged task', async () => {
        await tasksPage.goto();
        await tasksPage.expectLoaded();
        await tasksPage.waitForTableLoaded();
        await tasksPage.expectTaskVisible(created.name);
      });

      await test.step('Delete the task', async () => {
        await tasksPage.deleteTask(created.name);
      });

      await test.step('Verify task is removed from table', async () => {
        await tasksPage.waitForTableLoaded();
        await tasksPage.expectTaskNotVisible(created.name);
      });

      await test.step('Verify DELETE is recorded in audit trail', async () => {
        await navbar.navigateTo('Auditoría');
        await page.waitForURL(/\/audit-trail/);
        await auditPage.expectLoaded();
        await auditPage.verifyTaskAuditRecord(created.name, 'Eliminar');
      });
    });
  });
});
