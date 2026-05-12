/**
 * Idempotency cache for server-side API routes.
 *
 * Keyed by `${userId}:${method}:${idempotencyKey}` (TTL 5 min).
 * Protects against double-clicks and client retries that hit the server
 * after the first request was already processed successfully.
 *
 * Scope: in-process (per Lambda instance). Race conditions across different
 * Lambda instances are acceptable for this use case (same-client retries
 * almost always land on the same warm instance).
 */

interface IdempotencyCacheEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const _cache = new Map<string, IdempotencyCacheEntry>();
const TTL_MS = 5 * 60 * 1_000; // 5 minutes

function makeKey(userId: string, method: string, idempotencyKey: string): string {
  return `${userId}:${method}:${idempotencyKey}`;
}

/**
 * Check if a request with this idempotency key was already processed.
 * Returns the cached response { status, body } or null if not found.
 */
export function checkIdempotency(
  idempotencyKey: string | null | undefined,
  userId: string,
  method: string,
): { status: number; body: unknown } | null {
  if (!idempotencyKey) return null;

  const key = makeKey(userId, method, idempotencyKey);
  const entry = _cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt <= now) {
    _cache.delete(key);
    return null;
  }

  return { status: entry.status, body: entry.body };
}

/**
 * Store a successfully processed response so future duplicate requests
 * receive the same response without re-executing the operation.
 */
export function cacheIdempotencyResponse(
  idempotencyKey: string | null | undefined,
  userId: string,
  method: string,
  status: number,
  body: unknown,
): void {
  if (!idempotencyKey) return;

  const key = makeKey(userId, method, idempotencyKey);
  _cache.set(key, { status, body, expiresAt: Date.now() + TTL_MS });

  // Opportunistic cleanup of expired entries (every ~100 writes)
  if (_cache.size % 100 === 0) {
    const now = Date.now();
    for (const [k, v] of _cache) {
      if (v.expiresAt <= now) _cache.delete(k);
    }
  }
}
