/**
 * Utilidades de ClickUp seguras para usar en el cliente (sin server-only deps).
 */

/**
 * Returns true if the input looks like a ClickUp URL or a bare ClickUp task ID.
 *
 * In the UI (TaskForm), the autofill button only activates when the field also
 * passes `isValidUrl()`, so in practice only ClickUp URLs reach the button.
 * The bare-ID branch is still supported for server-side usage (ai-autofill route).
 */
export function isClickUpUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  // Validate as URL: require http/https, hostname *.clickup.com, and task path /t/<id>
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const validHost =
      hostname === "clickup.com" || hostname.endsWith(".clickup.com");
    const hasTaskPath = /\/t\/[a-zA-Z0-9]+/.test(url.pathname);
    return validHost && hasTaskPath;
  } catch {
    // Not a URL — check if it's a bare task ID: alphanumeric, 5-15 chars
    return /^[a-zA-Z0-9]{5,15}$/.test(trimmed);
  }
}
