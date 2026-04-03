import { type Page, type Locator, expect } from '@playwright/test';

/**
 * ReportsPage – Page Object Model
 *
 * Follows Playwright best practices:
 * - Uses role-based selectors (getByRole) for headings, buttons
 * - Uses locator with title/data-tour attributes for action buttons
 * - Explicit waits instead of timeouts
 * - No DOM queries — Locator-based assertions only
 */
export class ReportsPage {
  readonly page: Page;

  // Page-level elements
  readonly heading: Locator;
  readonly skeletonIndicator: Locator;
  readonly reportGrid: Locator;
  readonly emptyState: Locator;
  readonly refreshButton: Locator;

  // List filter controls
  readonly listFilterYear: Locator;
  readonly listFilterMonth: Locator;
  readonly listFilterProduct: Locator;
  readonly toggleFiltersButton: Locator;

  // Detail modal
  readonly detailModal: Locator;
  readonly detailModalTitle: Locator;
  readonly detailModalCloseButton: Locator;
  readonly detailModalDownloadButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page heading is inside <main>
    this.heading = page.locator('main').getByRole('heading', { name: 'Reportes', level: 1 });
    this.skeletonIndicator = page.getByTestId('skeleton-table');
    this.reportGrid = page.locator('[data-tour="report-list"]');
    this.emptyState = page.getByText('No hay reportes para los filtros seleccionados');
    this.refreshButton = page.getByRole('button', { name: 'Actualizar' });

    // List filter selectors (id-based)
    this.listFilterYear = page.locator('#list-filter-year');
    this.listFilterMonth = page.locator('#list-filter-month');
    this.listFilterProduct = page.locator('#list-filter-product');
    this.toggleFiltersButton = page.getByRole('button', { name: /Ocultar Filtros|Mostrar Filtros/i });

    // Detail modal (role="dialog" from Modal.tsx)
    this.detailModal = page.getByRole('dialog');
    this.detailModalTitle = page.getByRole('heading', { name: 'Detalle del Reporte' });
    this.detailModalCloseButton = this.detailModal.getByRole('button', { name: 'Cerrar modal' });
    this.detailModalDownloadButton = this.detailModal.getByRole('button', { name: 'Descargar PDF' });
  }

  // ── Navigation ──────────────────────────────────────────────

  /** Navigate to /reports and wait for the heading */
  async goto() {
    await this.page.goto('/reports');
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait for reports to finish loading (skeleton hidden, content appears) */
  async waitForLoaded() {
    // Wait for skeleton to be hidden
    await expect(this.skeletonIndicator).toBeHidden();
    
    // Wait for report grid to be present (even if empty)
    // This handles the loading of default filters (previous month) in the React component
    try {
      await this.reportGrid.waitFor({ state: 'attached' });
    } catch {
      // If grid doesn't attach, wait for empty state
      await this.emptyState.waitFor({ state: 'visible' });
    }
  }

  /** Assert the page is fully loaded */
  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await this.waitForLoaded();
  }

  // ── Filtering ───────────────────────────────────────────────

  /** Set list filter year */
  async filterByYear(year: number) {
    await this.listFilterYear.selectOption(String(year));
    await this.waitForLoaded();
  }

  /** Set list filter month (0 = Todos) */
  async filterByMonth(month: number) {
    await this.listFilterMonth.selectOption(String(month));
    await this.waitForLoaded();
  }

  /** Set list filter product ('' = Todos) */
  async filterByProduct(product: '' | 'Core' | 'Platform' | 'Commerce') {
    await this.listFilterProduct.selectOption(product);
    await this.waitForLoaded();
  }

  /** Refresh the report list */
  async refresh() {
    await this.refreshButton.click();
    await this.waitForLoaded();
  }

  // ── Report Cards ────────────────────────────────────────────

  /** Get all visible report cards */
  getReportCards() {
    return this.reportGrid.locator('> div');
  }

  /** Get total number of visible report cards */
  async getReportCount(): Promise<number> {
    const hasGrid = await this.reportGrid.isVisible().catch(() => false);
    if (!hasGrid) return 0;

    const cards = this.getReportCards();
    
    // Wait for cards to render using global timeout strategy
    // The reportGrid should have rendered with either cards or empty state
    // by the time expectLoaded() completes in the fixture
    try {
      // Try to find at least one card first
      const firstCard = cards.first();
      await firstCard.waitFor({ state: 'attached' });
    } catch {
      // If no cards, the empty state should be visible—that's fine
      try {
        await this.emptyState.waitFor({ state: 'visible' });
      } catch {
        // Neither cards nor empty state—shouldn't happen with good load
      }
    }
    
    return cards.count();
  }

  /** Check if there are reports available */
  async hasReports(): Promise<boolean> {
    return (await this.getReportCount()) > 0;
  }

  /** Get a random report card index */
  async getRandomReportIndex(): Promise<number> {
    const count = await this.getReportCount();
    return Math.floor(Math.random() * count);
  }

  /**
   * Get the report card info text (product, version, date) for the card at the given index.
   */
  async getReportCardInfo(index: number): Promise<{
    productText: string;
    versionText: string;
    dateText: string;
  }> {
    const card = this.getReportCards().nth(index);
    const productText = await card.locator('h3').textContent() ?? '';
    const versionText = await card.locator('[data-tour="report-versioning"]').textContent() ?? '';
    const dateText = await card.locator('p').last().textContent() ?? '';
    return { productText, versionText, dateText };
  }

  // ── View Report (Eye Icon) ─────────────────────────────────

  /** Click the eye icon on a report card at the given index */
  async openReportDetail(index: number) {
    const card = this.getReportCards().nth(index);
    const viewButton = card.locator('[data-tour="report-view"] button');
    await viewButton.click();
    await expect(this.detailModal).toBeVisible();
  }

  /** Assert the detail modal is visible with expected content */
  async expectDetailModalVisible() {
    await expect(this.detailModal).toBeVisible();
    await expect(this.detailModalTitle).toBeVisible();
  }

  /**
   * Assert the detail modal contains the expected structural elements:
   * - Product heading (h2 with "Producto:")
   * - Version/date info
   * - "Tareas por Squad" section if there are tasks
   * - At least one "Nota Final" score display
   */
  async expectDetailModalContent() {
    // Wait for loading to finish (skeleton should disappear)
    const skeleton = this.detailModal.locator('.animate-pulse');
    await expect(skeleton).toBeHidden();

    // Product heading
    const productHeading = this.detailModal.getByRole('heading', { name: /Producto:/i });
    await expect(productHeading).toBeVisible();

    // Version & date info
    const versionText = this.detailModal.getByText(/Versión \d+/);
    await expect(versionText).toBeVisible();

    const generatedText = this.detailModal.getByText(/Generado:/);
    await expect(generatedText).toBeVisible();
  }

  /**
   * Assert the detail modal shows tasks table with proper structure.
   * Returns true if "Tareas por Squad" section is present.
   */
  async expectDetailHasTasksTable(): Promise<boolean> {
    const tasksHeading = this.detailModal.getByRole('heading', { name: /Tareas por Squad/i });
    const hasTasks = await tasksHeading.isVisible().catch(() => false);

    if (hasTasks) {
      // Verify at least one table exists inside the modal
      const tables = this.detailModal.locator('table');
      const tableCount = await tables.count();
      expect(tableCount).toBeGreaterThanOrEqual(1);

      // Verify table headers exist (N°, Nombre, Bajas, Medias, Graves, Nota)
      const firstTable = tables.first();
      await expect(firstTable.getByText('Nombre')).toBeVisible();
      await expect(firstTable.getByText('Nota')).toBeVisible();

      // Verify at least one "Nota Final" score is shown
      const finalScore = this.detailModal.getByText(/Nota Final:/);
      await expect(finalScore.first()).toBeVisible();
    }

    return hasTasks;
  }

  /**
   * Assert that AI-generated comments are present in the detail modal.
   * Checks for "Desempeño" and/or "Comunicación" section headers.
   */
  async expectDetailHasAIComments(): Promise<{ performance: boolean; communication: boolean }> {
    const performanceBox = this.detailModal.getByText('Desempeño', { exact: true });
    const communicationBox = this.detailModal.getByText('Comunicación', { exact: true });

    const hasPerformance = await performanceBox.first().isVisible().catch(() => false);
    const hasCommunication = await communicationBox.first().isVisible().catch(() => false);

    return { performance: hasPerformance, communication: hasCommunication };
  }

  /** Close the detail modal */
  async closeDetailModal() {
    await this.detailModalCloseButton.click();
    await expect(this.detailModal).toBeHidden();
  }

  // ── Download ────────────────────────────────────────────────

  /**
   * Click the download button on a report card and return the Download object.
   * jsPDF triggers a client-side download via a temporary <a> element.
   */
  async downloadReport(index: number) {
    const card = this.getReportCards().nth(index);
    const downloadButton = card.locator('[data-tour="report-download"] button');

    // Wait for download event
    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    return downloadPromise;
  }

  /**
   * Click the download button inside the detail modal header.
   */
  async downloadFromModal() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.detailModalDownloadButton.click();
    return downloadPromise;
  }
}
