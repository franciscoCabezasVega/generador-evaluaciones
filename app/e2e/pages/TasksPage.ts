import { type Page, type Locator, expect } from '@playwright/test';

/**
 * TasksPage – Page Object Model
 *
 * Follows Playwright best practices:
 * - Uses role-based selectors (getByRole) for headings, buttons, tables
 * - Uses getByLabel for form inputs
 * - Uses getByTestId for data-testid marked elements
 * - Uses getByPlaceholder only when labels aren't available
 * - Explicit waits (waitFor, toBeVisible, toBeHidden) instead of timeouts
 * - No waitForFunction with DOM queries — uses Locator-based assertions
 */
export class TasksPage {
  readonly page: Page;

  // Page-level elements
  readonly heading: Locator;
  readonly newTaskButton: Locator;
  readonly searchInput: Locator;
  readonly toggleFiltersButton: Locator;
  readonly refreshButton: Locator;
  readonly taskTable: Locator;
  readonly skeletonTable: Locator;
  readonly emptyState: Locator;
  readonly tableContainer: Locator;

  // Modal elements (uses role="dialog" from Modal.tsx)
  readonly formDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    // Scope heading to <main> to avoid matching the Navbar's "Evaluador de Tareas" h1
    this.heading = page.locator('main').getByRole('heading', { name: 'Tareas', level: 1 });
    this.newTaskButton = page.getByRole('button', { name: '+ Nueva Tarea' });
    this.searchInput = page.getByPlaceholder('Escribe el nombre de la tarea...');
    this.toggleFiltersButton = page.getByRole('button', { name: /Filtros/i });
    this.refreshButton = page.getByTestId('refresh-tasks');
    this.taskTable = page.getByTestId('tasks-table');
    this.skeletonTable = page.getByTestId('skeleton-table');
    this.emptyState = page.getByTestId('tasks-empty-state');
    this.tableContainer = page.getByTestId('tasks-table-container');
    this.formDialog = page.getByRole('dialog');
  }

  // ── Navigation ──────────────────────────────────────────────

  /** Navigate to /tasks and wait for the heading */
  async goto() {
    await this.page.goto('/tasks');
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait for the tasks table to load (skeleton disappears, content appears) */
  async waitForTableLoaded() {
    // Wait for skeleton to disappear using the data-testid locator
    await expect(this.skeletonTable).toBeHidden();
    // Then wait for either the table or the empty state to be visible
    const contentVisible = this.tableContainer.or(this.emptyState);
    await expect(contentVisible.first()).toBeVisible();
  }

  // ── Task Table ──────────────────────────────────────────────

  /** Get all visible task rows */
  getTaskRows() {
    return this.taskTable.locator('tbody tr').filter({
      hasNot: this.page.locator('[data-tour="task-row-details"]'),
    });
  }

  /** Find a task row by task name */
  getTaskRowByName(name: string) {
    return this.taskTable.locator('tbody tr').filter({
      has: this.page.getByText(name, { exact: false }),
    }).first();
  }

  /** Assert a task with the given name exists in the table */
  async expectTaskVisible(name: string) {
    await expect(this.getTaskRowByName(name)).toBeVisible();
  }

  /** Assert a task with the given name does NOT exist */
  async expectTaskNotVisible(name: string) {
    await expect(
      this.taskTable.getByText(name, { exact: false }),
    ).toBeHidden();
  }

  // ── CRUD Actions ────────────────────────────────────────────

  /** Open "New Task" modal and wait for the dialog to appear */
  async openNewTaskForm() {
    await this.newTaskButton.click();
    await expect(this.formDialog).toBeVisible();
    await expect(
      this.page.getByRole('heading', { name: 'Nueva Tarea' }),
    ).toBeVisible();
  }

  /** Click "Edit" on a task row and wait for dialog */
  async openEditForm(taskName: string) {
    const row = this.getTaskRowByName(taskName);
    await row.getByRole('button', { name: 'Editar tarea' }).click();
    await expect(this.formDialog).toBeVisible();
    await expect(
      this.page.getByRole('heading', { name: 'Editar Tarea' }),
    ).toBeVisible();
  }

  /** Click "Delete" on a task row and accept the confirmation dialog */
  async deleteTask(taskName: string) {
    const row = this.getTaskRowByName(taskName);

    // Setup dialog handler before clicking
    this.page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Eliminar tarea' }).click();
  }

  // ── Task Form Interaction ───────────────────────────────────

  /**
   * Fill the task form fields (works for both create and edit).
   *
   * Uses getByLabel for all standard inputs and selects.
   * Uses getByTestId for squad sections.
   */
  async fillTaskForm(data: {
    name: string;
    link: string;
    productType?: 'Platform' | 'Core' | 'Commerce';
    squad?: string;
    squads?: Array<{
      name: string;
      low?: number;
      medium?: number;
      high?: number;
      notes?: string;
    }>;
    status?: 'Pendiente' | 'Completada' | 'Deprecada';
    month?: number;
    year?: number;
    projectType?: string;
    tshirtSize?: string;
    effortScoreDate?: string;
  }) {
    // Name
    const nameInput = this.page.getByLabel('Nombre *');
    await nameInput.clear();
    await nameInput.fill(data.name);

    // Link
    const linkInput = this.page.getByLabel('Link *');
    await linkInput.clear();
    await linkInput.fill(data.link);

    // Product type — wait for squad list to update after selection
    if (data.productType) {
      const productSelect = this.page.getByLabel('Producto *');
      await productSelect.selectOption(data.productType);
      // Wait for the "Agregar otro squad" select to reflect the new product type
      await expect(
        this.page.getByLabel('Agregar otro squad'),
      ).toBeVisible();
    }

    // ── Squads ──
    if (data.squads && data.squads.length > 0) {
      for (const squadInfo of data.squads) {
        await this.addSquadWithReturns(
          squadInfo.name,
          squadInfo.low ?? 0,
          squadInfo.medium ?? 0,
          squadInfo.high ?? 0,
          squadInfo.notes,
        );
      }
    } else if (data.squad) {
      const addSquadSelect = this.page.getByLabel('Agregar otro squad');
      if (await addSquadSelect.isVisible()) {
        await addSquadSelect.selectOption(data.squad);
      }
    }

    // Status
    if (data.status) {
      await this.page.getByLabel('Estado *').selectOption(data.status);
    }

    // Month
    if (data.month) {
      await this.page.getByLabel('Mes *').selectOption(String(data.month));
    }

    // Year
    if (data.year) {
      await this.page.getByLabel('Año *').selectOption(String(data.year));
    }

    // Project Type
    if (data.projectType) {
      await this.page.getByLabel('Tipo Proyecto').selectOption(data.projectType);
    }

    // T-shirt Size
    if (data.tshirtSize) {
      // The select options contain extra text (e.g., "M — 2 a 3 días (16-24h)"),
      // so we select by value attribute
      await this.page.locator('#task-tshirt-size').selectOption(data.tshirtSize);
    }

    // Effort Score Date
    if (data.effortScoreDate) {
      await this.page.locator('#task-effort-date').fill(data.effortScoreDate);
    }
  }

  /**
   * Add a squad via the "Agregar otro squad" select and fill its
   * devoluciones (low/medium/high) using data-testid and name attributes.
   */
  private async addSquadWithReturns(
    squadName: string,
    low: number,
    medium: number,
    high: number,
    notes?: string,
  ) {
    // Add the squad using aria-label
    const addSquadSelect = this.page.getByLabel('Agregar otro squad');
    await expect(addSquadSelect).toBeVisible();
    await addSquadSelect.selectOption(squadName);

    // Wait for the squad section to appear using data-testid
    const squadSection = this.page.getByTestId(`squad-section-${squadName}`);
    await expect(squadSection).toBeVisible();

    // Fill devoluciones using name attributes within the squad section
    if (low > 0) {
      const lowInput = squadSection.locator(`input[name="low-returns-${squadName}"]`);
      await lowInput.click();
      await lowInput.fill(String(low));
    }
    if (medium > 0) {
      const mediumInput = squadSection.locator(`input[name="medium-returns-${squadName}"]`);
      await mediumInput.click();
      await mediumInput.fill(String(medium));
    }
    if (high > 0) {
      const highInput = squadSection.locator(`input[name="high-returns-${squadName}"]`);
      await highInput.click();
      await highInput.fill(String(high));
    }

    // Fill optional notes using the textarea in the squad section
    if (notes) {
      const notesTextarea = squadSection.locator('textarea');
      await notesTextarea.fill(notes);
    }
  }

  /**
   * Select QA members in the QA Asignados multi-selector.
   * Opens the dropdown, clicks each QA name, then closes it.
   */
  async selectQAMembers(qaNames: string[]) {
    // Open the QA selector dropdown
    const qaButton = this.page.getByRole('button', { name: 'QA Asignados' });
    await qaButton.click();
    await expect(this.page.getByRole('listbox')).toBeVisible();

    // Click each QA member
    for (const name of qaNames) {
      await this.page.getByRole('listbox').getByRole('button', { name, exact: true }).click();
    }

    // Close the dropdown by pressing Escape
    await this.page.keyboard.press('Escape');
    // Use JavaScript to ensure dropdown is hidden
    await this.page.evaluate(() => {
      const listbox = document.getElementById('qa-task-selector-options');
      if (listbox) {
        listbox.style.display = 'none';
      }
    });
  }

  /**
   * Get the currently selected QA member names from the chips in the QA selector.
   */
  async getSelectedQAChips(): Promise<string[]> {
    const qaButton = this.page.getByRole('button', { name: 'QA Asignados' });
    const chips = qaButton.locator('span.inline-flex');
    const count = await chips.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await chips.nth(i).innerText();
      // The chip text contains the name + an "x" icon character, trim it
      names.push(text.replace(/\s*[×✕]\s*$/, '').trim());
    }
    return names;
  }

  /** Submit the task form and wait for the dialog to close (success) */
  async submitTaskForm() {
    const saveButton = this.page.getByRole('button', { name: /Guardar Tarea/i });
    // Use force: true to bypass pointer intercept if dropdown is still visible
    await saveButton.click({ force: true });

    // Wait for dialog to disappear (indicates success)
    await expect(this.formDialog).toBeHidden();
  }

  /** Cancel the task form */
  async cancelTaskForm() {
    await this.page.getByRole('button', { name: 'Cancelar' }).click();
  }

  // ── Search & Filters ───────────────────────────────────────

  /** Search for a task by name */
  async searchTask(name: string) {
    await this.searchInput.fill(name);
  }

  /** Clear the search input */
  async clearSearch() {
    await this.searchInput.clear();
  }

  // ── Assertions ──────────────────────────────────────────────

  /** Assert the page is fully loaded (heading visible, skeleton gone) */
  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await this.waitForTableLoaded();
  }

  /** Assert not showing skeleton */
  async expectNoSkeleton() {
    await expect(this.skeletonTable).toBeHidden();
  }

  /** Assert the table has content (at least 1 row or empty message) */
  async expectTableHasContent() {
    const tableOrEmpty = this.tableContainer.or(this.emptyState);
    await expect(tableOrEmpty.first()).toBeVisible();
  }
}
