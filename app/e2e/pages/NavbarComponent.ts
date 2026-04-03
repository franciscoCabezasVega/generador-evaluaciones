import { type Page, type Locator, expect } from '@playwright/test';

/**
 * NavbarComponent – Page Object Model
 *
 * Follows Playwright best practices:
 * - Uses role-based selectors (getByRole) for links and buttons
 * - Uses data-testid for the navbar container
 * - Uses aria-label for navigation landmark
 * - Explicit waits instead of timeouts
 */
export class NavbarComponent {
  readonly page: Page;
  readonly root: Locator;
  readonly tasksLink: Locator;
  readonly reportsLink: Locator;
  readonly timingsLink: Locator;
  readonly auditLink: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('navigation', { name: 'Navegación principal' });
    this.tasksLink = this.root.getByRole('link', { name: 'Tareas' });
    this.reportsLink = this.root.getByRole('link', { name: 'Reportes' });
    this.timingsLink = this.root.getByRole('link', { name: 'Tiempos' });
    this.auditLink = this.root.getByRole('link', { name: 'Auditoría' });
    this.logoutButton = page.getByTestId('logout-button');
  }

  /** Navigate to a specific section via navbar link */
  async navigateTo(section: 'Tareas' | 'Reportes' | 'Tiempos' | 'Auditoría') {
    const links: Record<string, Locator> = {
      Tareas: this.tasksLink,
      Reportes: this.reportsLink,
      Tiempos: this.timingsLink,
      Auditoría: this.auditLink,
    };
    await links[section].click();
  }

  /** Logout and wait for redirect to login */
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL(/\/auth\/login/);
  }

  /** Assert the navbar is visible with user info (logout button present) */
  async expectAuthenticated() {
    await expect(this.root).toBeVisible();
    await expect(this.logoutButton).toBeVisible();
  }

  /** Assert we are on a specific section (active link has distinct styling) */
  async expectActiveSection(section: string) {
    const link = this.root.getByRole('link', { name: section });
    await expect(link).toHaveClass(/text-blue-600/);
  }
}
