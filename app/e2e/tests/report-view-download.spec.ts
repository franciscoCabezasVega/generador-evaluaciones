import { test, expect } from '../fixtures';

/**
 * E2E: Report View & Download (read-only)
 *
 * Scope:
 *  - View existing reports already created (NO creation, NO deletion)
 *  - Open a random report via the eye icon and validate the detail modal
 *  - Download a report PDF and validate the file
 *
 * Prerequisites:
 *  - At least one report must already exist in the database for the
 *    default filters (current month/year). If no reports are found,
 *    the test adjusts filters to "all months" to find any report.
 *
 * Best practices:
 * - Role-based selectors via POM (ReportsPage)
 * - data-tour attributes for action buttons
 * - Explicit waits (toBeVisible, waitForEvent) — no arbitrary sleeps
 * - Random report selection to defeat the Pesticide Paradox
 */
// TODO: Re-enable once ReportsPage POM refactor is complete
test.describe.skip('Report View & Download', () => {
  test('should open a random report detail modal and validate its content', async ({
    authenticatedReportsPage: reportsPage,
  }) => {
    let reportCount = 0;

    // ── Ensure reports are available ─────────────────────────
    await test.step('Verify reports are loaded and available', async () => {
      reportCount = await reportsPage.getReportCount();

      // If no reports with default filters, try "all months" to broaden search
      if (reportCount === 0) {
        await reportsPage.filterByMonth(0);
        reportCount = await reportsPage.getReportCount();
      }

      // If still no reports, try removing product filter too
      if (reportCount === 0) {
        await reportsPage.filterByProduct('');
        reportCount = await reportsPage.getReportCount();
      }

      // Skip gracefully if there are truly no reports in the system
      test.skip(reportCount === 0, 'No reports found in the system — skipping view test');
    });

    // ── Pick a random report ─────────────────────────────────
    const randomIndex = Math.floor(Math.random() * reportCount);
    let cardInfo: { productText: string; versionText: string; dateText: string };

    await test.step(`Read card info at index ${randomIndex}`, async () => {
      cardInfo = await reportsPage.getReportCardInfo(randomIndex);

      // Validate the card itself has basic info
      expect(cardInfo.productText).toContain('Producto:');
      expect(cardInfo.versionText).toMatch(/Versión \d+/);
    });

    // ── Open detail modal via eye icon ───────────────────────
    await test.step('Click eye icon to open report detail modal', async () => {
      await reportsPage.openReportDetail(randomIndex);
      await reportsPage.expectDetailModalVisible();
    });

    // ── Validate modal structural content ────────────────────
    await test.step('Validate modal contains expected report information', async () => {
      // Core content: product heading, version, generation date
      await reportsPage.expectDetailModalContent();
    });

    await test.step('Validate tasks table structure in modal (if tasks exist)', async () => {
      await reportsPage.expectDetailHasTasksTable();
    });

    await test.step('Check for AI-generated comments in modal', async () => {
      await reportsPage.expectDetailHasAIComments();
      // Comments are optional (depend on whether the report had completed tasks)
    });

    // ── Close the modal ──────────────────────────────────────
    await test.step('Close the detail modal', async () => {
      await reportsPage.closeDetailModal();
    });
  });

  test('should download a report PDF with valid filename', async ({
    authenticatedReportsPage: reportsPage,
  }) => {
    let reportCount = 0;

    // ── Ensure reports are available ─────────────────────────
    await test.step('Verify reports are loaded and available', async () => {
      reportCount = await reportsPage.getReportCount();

      if (reportCount === 0) {
        await reportsPage.filterByMonth(0);
        reportCount = await reportsPage.getReportCount();
      }

      if (reportCount === 0) {
        await reportsPage.filterByProduct('');
        reportCount = await reportsPage.getReportCount();
      }

      test.skip(reportCount === 0, 'No reports found in the system — skipping download test');
    });

    // ── Pick a random report for download ────────────────────
    const randomIndex = Math.floor(Math.random() * reportCount);

    // ── Trigger download from report card ────────────────────
    await test.step('Click download button and capture download event', async () => {
      const download = await reportsPage.downloadReport(randomIndex);

      // Validate the download triggered
      expect(download).toBeTruthy();

      // Validate filename follows the expected pattern: Reporte-Evaluaciones-{month}-{year}-v{version}.pdf
      const suggestedFilename = download.suggestedFilename();
      expect(suggestedFilename).toMatch(/^Reporte-Evaluaciones-\d+-\d+-v\d+\.pdf$/);

      // Save to temp path and validate file is not empty
      const filePath = await download.path();
      expect(filePath).toBeTruthy();

      // Read file stats to ensure it has content (jsPDF generates at least a few KB)
      const fs = await import('fs');
      const stats = fs.statSync(filePath!);
      expect(stats.size).toBeGreaterThan(500); // PDF header alone is ~100+ bytes
    });
  });

  test('should download a report PDF from inside the detail modal', async ({
    authenticatedReportsPage: reportsPage,
  }) => {
    let reportCount = 0;

    // ── Ensure reports are available ─────────────────────────
    await test.step('Verify reports are loaded and available', async () => {
      reportCount = await reportsPage.getReportCount();

      if (reportCount === 0) {
        await reportsPage.filterByMonth(0);
        reportCount = await reportsPage.getReportCount();
      }

      if (reportCount === 0) {
        await reportsPage.filterByProduct('');
        reportCount = await reportsPage.getReportCount();
      }

      test.skip(reportCount === 0, 'No reports found in the system — skipping modal download test');
    });

    // ── Open a random report detail ──────────────────────────
    const randomIndex = Math.floor(Math.random() * reportCount);

    await test.step('Open report detail modal', async () => {
      await reportsPage.openReportDetail(randomIndex);
      await reportsPage.expectDetailModalVisible();

      // Wait for modal content to fully load (skeleton gone)
      await reportsPage.expectDetailModalContent();
    });

    // ── Download from modal header ───────────────────────────
    await test.step('Click download button inside the modal and validate', async () => {
      const download = await reportsPage.downloadFromModal();

      expect(download).toBeTruthy();

      const suggestedFilename = download.suggestedFilename();
      expect(suggestedFilename).toMatch(/^Reporte-Evaluaciones-\d+-\d+-v\d+\.pdf$/);

      // Validate file has content
      const filePath = await download.path();
      expect(filePath).toBeTruthy();

      const fs = await import('fs');
      const stats = fs.statSync(filePath!);
      expect(stats.size).toBeGreaterThan(500);
    });

    // ── Close modal after download ───────────────────────────
    await test.step('Close the detail modal', async () => {
      await reportsPage.closeDetailModal();
    });
  });
});
