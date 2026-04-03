import { test as base, expect } from '@playwright/test';
import { LoginPage, TasksPage, NavbarComponent, AuditPage, ReportsPage } from '../pages';

/**
 * Test credentials – loaded from .env.local via dotenv (configured in playwright.config.ts).
 * Playwright docs recommend this pattern:
 * @see https://playwright.dev/docs/test-parameterize#env-files
 *
 * NEVER commit real production credentials.
 */
export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL!,
  password: process.env.E2E_USER_PASSWORD!,
};

/**
 * Custom Playwright fixtures following the Dependency Inversion Principle:
 * tests depend on abstractions (page objects) not concrete selectors.
 *
 * - `loginPage`: LoginPage POM
 * - `tasksPage`: TasksPage POM
 * - `navbar`: NavbarComponent POM
 * - `auditPage`: AuditPage POM
 * - `reportsPage`: ReportsPage POM
 * - `authenticatedPage`: auto-logs in and lands on /tasks
 * - `authenticatedReportsPage`: auto-logs in and lands on /reports
 */
type AppFixtures = {
  loginPage: LoginPage;
  tasksPage: TasksPage;
  navbar: NavbarComponent;
  auditPage: AuditPage;
  reportsPage: ReportsPage;
  authenticatedPage: TasksPage;
  authenticatedReportsPage: ReportsPage;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  tasksPage: async ({ page }, use) => {
    await use(new TasksPage(page));
  },

  navbar: async ({ page }, use) => {
    await use(new NavbarComponent(page));
  },

  auditPage: async ({ page }, use) => {
    await use(new AuditPage(page));
  },

  reportsPage: async ({ page }, use) => {
    await use(new ReportsPage(page));
  },

  /**
   * Logs in automatically and navigates to /tasks.
   * Re-used by multiple test suites to avoid duplicating auth logic.
   */
  authenticatedPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForRedirect(TEST_USER.email, TEST_USER.password);

    // Navigate to tasks and wait for full load
    const tasks = new TasksPage(page);
    await tasks.goto();
    await tasks.expectLoaded();

    await use(tasks);
  },

  /**
   * Logs in automatically and navigates to /reports.
   * Used by report-specific test suites.
   */
  authenticatedReportsPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForRedirect(TEST_USER.email, TEST_USER.password);

    // Navigate to reports and wait for full load
    const reports = new ReportsPage(page);
    await reports.goto();
    await reports.expectLoaded();

    await use(reports);
  },
});

export { expect };
