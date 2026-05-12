/**
 * Idempotency cache for server-side API routes.
 *
 * Keyed by `${userId}:${method}:${path}:${idempotencyKey}` (TTL 5 min).
 * Protects against double-clicks and client retries that hit the server
 * after the first request was already processed successfully.
 *
 * Also coalesces in-flight requests: if a duplicate arrives while the first
 * is still executing, it waits for the same Promise instead of re-running.
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
// Coalescing de requests en vuelo con el mismo key
const _pending = new Map<string, Promise<{ status: number; body: unknown } | null>>();
const TTL_MS = 5 * 60 * 1_000; // 5 minutes

function makeKey(userId: string, method: string, path: string, idempotencyKey: string): string {
  return `${userId}:${method}:${path}:${idempotencyKey}`;
}

/**
 * Check if a request with this idempotency key was already processed.
 * Returns the cached response { status, body } or null if not found / expired.
 */
export function checkIdempotency(
  idempotencyKey: string | null | undefined,
  userId: string,
  method: string,
  path?: string,
): { status: number; body: unknown } | null {
  if (!idempotencyKey) return null;

  const key = makeKey(userId, method, path ?? "", idempotencyKey);
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
 * Wraps the actual handler execution with coalescing: if a duplicate request
 * arrives while the first is still in flight, it awaits the same Promise.
 * Call this instead of checkIdempotency + cacheIdempotencyResponse when you
 * want full in-flight deduplication.
 */
export async function withIdempotency(
  idempotencyKey: string | null | undefined,
  userId: string,
  method: string,
  path: string,
  handler: () => Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown }> {
  if (!idempotencyKey) return handler();

  const key = makeKey(userId, method, path, idempotencyKey);

  // Cache hit
  const cached = _cache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) return { status: cached.status, body: cached.body };
    _cache.delete(key);
  }

  // In-flight coalescing
  if (_pending.has(key)) return (await _pending.get(key)!)!;

  const promise = (async () => {
    try {
      const result = await handler();
      _cache.set(key, { ...result, expiresAt: Date.now() + TTL_MS });

      // Opportunistic cleanup every ~100 writes
      if (_cache.size % 100 === 0) {
        const now = Date.now();
        for (const [k, v] of _cache) {
          if (v.expiresAt <= now) _cache.delete(k);
        }
      }

      return result;
    } finally {
      _pending.delete(key);
    }
  })();

  _pending.set(key, promise);
  return promise;
}

/**
 * Store a successfully processed response so future duplicate requests
 * receive the same response without re-executing the operation.
 * Use this when you need manual control (e.g. after streaming responses).
 */
export function cacheIdempotencyResponse(
  idempotencyKey: string | null | undefined,
  userId: string,
  method: string,
  status: number,
  body: unknown,
  path?: string,
): void {
  if (!idempotencyKey) return;

  const key = makeKey(userId, method, path ?? "", idempotencyKey);
  _cache.set(key, { status, body, expiresAt: Date.now() + TTL_MS });

  // Opportunistic cleanup of expired entries (every ~100 writes)
  if (_cache.size % 100 === 0) {
    const now = Date.now();
    for (const [k, v] of _cache) {
      if (v.expiresAt <= now) _cache.delete(k);
    }
  }
}
