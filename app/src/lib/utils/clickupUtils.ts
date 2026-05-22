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
  // Validate as URL: require http/https and hostname *.clickup.com
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "clickup.com" || hostname.endsWith(".clickup.com");
  } catch {
    // Not a URL — check if it's a bare task ID: alphanumeric, 5-15 chars
    return /^[a-zA-Z0-9]{5,15}$/.test(trimmed);
  }
}
