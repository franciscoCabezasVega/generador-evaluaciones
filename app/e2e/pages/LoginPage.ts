import { type Page, type Locator, expect } from '@playwright/test';

/**
 * LoginPage – Page Object Model
 *
 * Follows Playwright best practices:
 * - Uses role-based selectors (getByRole, getByLabel)
 * - Uses data-testid for non-semantic elements
 * - Explicit waits instead of timeouts
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly loginForm: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Contraseña');
    this.submitButton = page.getByRole('button', { name: /Iniciar Sesión/i });
    this.errorAlert = page.getByTestId('login-error');
    this.loginForm = page.getByTestId('login-form');
  }

  /** Navigate to the login page and wait for the form to be interactive */
  async goto() {
    await this.page.goto('/auth/login');
    await this.emailInput.waitFor({ state: 'visible' });
  }

  /** Perform login with given credentials */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Login and wait until redirected away from /auth/login */
  async loginAndWaitForRedirect(email: string, password: string) {
    await this.login(email, password);
    await this.page.waitForURL((url) => !url.pathname.includes('/auth/login'));
  }

  /** Assert that the login page is visible */
  async expectVisible() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /** Assert an error message is shown */
  async expectError(text?: string) {
    await expect(this.errorAlert).toBeVisible();
    if (text) {
      await expect(this.errorAlert).toContainText(text);
    }
  }
}
