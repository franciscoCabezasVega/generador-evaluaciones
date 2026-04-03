import { type Page, type Locator, expect } from '@playwright/test';

/**
 * AuditPage – Page Object Model
 *
 * Follows Playwright best practices:
 * - Uses role-based selectors (getByRole) for headings, buttons, tables
 * - Uses getByTestId for data-testid elements
 * - Uses locator('#id') for HTML id-based selectors (filter dropdowns)
 * - Explicit waits with toBeVisible/toBeHidden instead of waitForFunction
 */
export class AuditPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly auditTable: Locator;
  readonly entityTypeFilter: Locator;
  readonly actionFilter: Locator;
  readonly refreshButton: Locator;
  readonly clearFiltersButton: Locator;
  readonly skeletonIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', {
      name: /Trazabilidad de Auditoría/i,
      level: 1,
    }).first();
    this.auditTable = page.getByRole('table').first();
    this.entityTypeFilter = page.locator('#audit-entity-type');
    this.actionFilter = page.locator('#audit-action');
    this.refreshButton = page.getByRole('button', { name: 'Actualizar' });
    this.clearFiltersButton = page.getByRole('button', { name: /Limpiar/i });
    // Skeleton indicator: look for skeleton table or any animate-pulse element
    this.skeletonIndicator = page.getByTestId('skeleton-table');
  }

  // ── Navigation ──────────────────────────────────────────────

  /** Navigate to /audit-trail and wait for page ready */
  async goto() {
    await this.page.goto('/audit-trail');
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait for audit data to finish loading (skeleton hidden, table visible) */
  async waitForLoaded() {
    // Wait for any skeleton table to disappear
    await expect(this.skeletonIndicator).toBeHidden();
    // Wait for the actual table to be visible
    await expect(this.auditTable).toBeVisible();
  }

  /** Assert the audit page is fully loaded */
  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await this.waitForLoaded();
  }

  // ── Filtering ───────────────────────────────────────────────

  /** Filter by entity type: 'TASK' | 'REPORT' | '' (all) */
  async filterByEntityType(type: 'TASK' | 'REPORT' | '') {
    await this.entityTypeFilter.selectOption(type);
    await this.waitForLoaded();
  }

  /** Filter by action: 'CREATE' | 'UPDATE' | 'DELETE' | '' (all) */
  async filterByAction(action: 'CREATE' | 'UPDATE' | 'DELETE' | '') {
    await this.actionFilter.selectOption(action);
    await this.waitForLoaded();
  }

  /** Refresh the audit list */
  async refresh() {
    await this.refreshButton.click();
    await this.waitForLoaded();
  }

  /** Clear all filters */
  async clearFilters() {
    await this.clearFiltersButton.click();
    await this.waitForLoaded();
  }

  // ── Row accessors ───────────────────────────────────────────

  /** Get all visible audit log rows */
  getAuditRows() {
    return this.auditTable.locator('tbody tr');
  }

  /** Get the first row in the audit table (most recent entry) */
  getFirstRow() {
    return this.getAuditRows().first();
  }

  /**
   * Find an audit row that contains the given entity name.
   * Returns the first matching row.
   */
  getRowByEntityName(name: string) {
    return this.auditTable.locator('tbody tr').filter({
      has: this.page.getByText(name, { exact: false }),
    }).first();
  }

  // ── Assertions ──────────────────────────────────────────────

  /**
   * Assert that an audit record exists for a given entity name
   * with the expected action badge (Crear / Actualizar / Eliminar).
   */
  async expectAuditEntry(
    entityName: string,
    expectedAction: 'Crear' | 'Actualizar' | 'Eliminar',
  ) {
    const row = this.getRowByEntityName(entityName);
    await expect(row).toBeVisible();
    await expect(row.getByText(expectedAction)).toBeVisible();
  }

  /**
   * Assert that an audit record for a given entity name has the
   * expected entity type badge (Tarea / Reporte).
   */
  async expectAuditEntityType(
    entityName: string,
    expectedType: 'Tarea' | 'Reporte',
  ) {
    const row = this.getRowByEntityName(entityName);
    await expect(row).toBeVisible();
    await expect(row.getByText(expectedType)).toBeVisible();
  }

  /**
   * Click on a row to open the detail modal and assert that
   * the modal shows the expected entity name.
   * Uses role="dialog" from the audit-trail modal.
   */
  async openDetailAndExpect(entityName: string) {
    const row = this.getRowByEntityName(entityName);
    await row.click();

    // Wait for the detail modal using role="dialog"
    const modal = this.page.getByTestId('audit-detail-modal');
    await expect(modal).toBeVisible();

    // Verify entity name appears in the modal
    await expect(modal.getByText(entityName).first()).toBeVisible();

    // Close modal via the aria-labeled close button
    await modal.getByRole('button', { name: 'Cerrar modal' }).click();
    await expect(modal).toBeHidden();
  }

  /**
   * Full assertion: filter for TASK + action, find the record by
   * entity name, verify badges, and open detail.
   */
  async verifyTaskAuditRecord(
    entityName: string,
    expectedAction: 'Crear' | 'Actualizar' | 'Eliminar',
  ) {
    const actionMap: Record<string, string> = {
      Crear: 'CREATE',
      Actualizar: 'UPDATE',
      Eliminar: 'DELETE',
    };

    // Filter to narrow down results
    await this.filterByEntityType('TASK');
    await this.filterByAction(actionMap[expectedAction] as 'CREATE' | 'UPDATE' | 'DELETE');

    // Assert the record exists with correct badges
    await this.expectAuditEntry(entityName, expectedAction);
    await this.expectAuditEntityType(entityName, 'Tarea');

    // Open detail and verify entity name in modal
    await this.openDetailAndExpect(entityName);

    // Clear filters for clean state
    await this.clearFilters();
  }
}
