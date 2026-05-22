/**
 * Utilidades de ClickUp seguras para usar en el cliente (sin server-only deps).
 */

/**
 * Returns true if the input looks like a ClickUp URL or a bare ClickUp task ID.
 * Used by the frontend to enable/disable the AI autofill button.
 */
export function isClickUpUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.includes("clickup.com/")) return true;
  // Bare task IDs: alphanumeric, 5-15 chars
  return /^[a-zA-Z0-9]{5,15}$/.test(trimmed);
}
