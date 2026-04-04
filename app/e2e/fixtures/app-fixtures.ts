import { test as base, expect } from '@playwright/test';
import { LoginPage, TasksPage, NavbarComponent, AuditPage, ReportsPage } from '../pages';

/**
 * Test credentials – loaded from .env.local via dotenv (configured in playwright.config.ts).
 * Playwright docs recommend this pattern:
 * @see https://playwright.dev/docs/test-parameterize#env-files
 *
 * NEVER commit real production credentials.
 * Used exclusively by auth.spec.ts which tests the login flow itself.
 */
export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL!,
  password: process.env.E2E_USER_PASSWORD!,
};

/**
 * Custom Playwright fixtures following the Dependency Inversion Principle:
 * tests depend on abstractions (page objects) not concrete selectors.
 *
 * - `loginPage`: LoginPage POM (no auth pre-loaded — for auth.spec.ts)
 * - `tasksPage`: TasksPage POM (no auth pre-loaded)
 * - `navbar`: NavbarComponent POM
 * - `auditPage`: AuditPage POM
 * - `reportsPage`: ReportsPage POM
 * - `authenticatedPage`: navigates to /tasks using the pre-loaded storageState
 * - `authenticatedReportsPage`: navigates to /reports using the pre-loaded storageState
 *
 * storageState is injected by the `setup` project in playwright.config.ts.
 * Every browser context in the `chromium` project already has the session
 * persisted — no manual login needed here.
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
   * Navigates to /tasks and waits for full load.
   * Auth is provided by the storageState loaded via playwright.config.ts setup project.
   * No UI login needed — session is already in the browser context.
   */
  authenticatedPage: async ({ page }, use) => {
    const tasks = new TasksPage(page);
    await tasks.goto();
    await tasks.expectLoaded();
    await use(tasks);
  },

  /**
   * Navigates to /reports and waits for full load.
   * Auth is provided by the storageState loaded via playwright.config.ts setup project.
   */
  authenticatedReportsPage: async ({ page }, use) => {
    const reports = new ReportsPage(page);
    await reports.goto();
    await reports.expectLoaded();
    await use(reports);
  },
});

export { expect };
