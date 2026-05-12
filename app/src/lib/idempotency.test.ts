import { withIdempotency } from "@/lib/idempotency";

// Expose module-private cache for reset between tests.
// jest.resetModules() is heavy; instead we rely on unique keys per test to avoid
// cross-test pollution for hit/miss tests, and use fake timers for TTL tests.

jest.useFakeTimers();

const TTL_MS = 5 * 60 * 1_000; // must match idempotency.ts

const USER = "user-abc";
const METHOD = "POST";
const PATH = "/api/tasks";

/** Returns a unique idempotency key per test to avoid cross-test cache hits. */
let keyCounter = 0;
function uniqueKey(): string {
  return `test-key-${++keyCounter}`;
}

describe("withIdempotency", () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  // ─── No key ────────────────────────────────────────────────────────────────
  it("runs handler directly when idempotencyKey is null", async () => {
    const handler = jest.fn().mockResolvedValue({ status: 201, body: { ok: true } });
    const result = await withIdempotency(null, USER, METHOD, PATH, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 201, body: { ok: true } });
  });

  it("runs handler directly when idempotencyKey is undefined", async () => {
    const handler = jest.fn().mockResolvedValue({ status: 200, body: {} });
    await withIdempotency(undefined, USER, METHOD, PATH, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Cache miss / first call ────────────────────────────────────────────────
  it("executes handler on first call with a valid key", async () => {
    const handler = jest.fn().mockResolvedValue({ status: 201, body: { id: "1" } });
    const result = await withIdempotency(uniqueKey(), USER, METHOD, PATH, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(201);
  });

  // ─── Cache hit ─────────────────────────────────────────────────────────────
  it("returns cached response on duplicate request within TTL", async () => {
    const key = uniqueKey();
    const handler = jest
      .fn()
      .mockResolvedValueOnce({ status: 201, body: { id: "cached" } })
      .mockResolvedValueOnce({ status: 201, body: { id: "second-call" } });

    await withIdempotency(key, USER, METHOD, PATH, handler);
    const result = await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.body).toEqual({ id: "cached" });
  });

  // ─── Cache miss after TTL expiry ───────────────────────────────────────────
  it("re-executes handler after TTL expires", async () => {
    const key = uniqueKey();
    const handler = jest
      .fn()
      .mockResolvedValueOnce({ status: 201, body: { call: 1 } })
      .mockResolvedValueOnce({ status: 201, body: { call: 2 } });

    await withIdempotency(key, USER, METHOD, PATH, handler);

    // Advance time past TTL
    jest.advanceTimersByTime(TTL_MS + 1);

    const result = await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.body).toEqual({ call: 2 });
  });

  // ─── In-flight deduplication ───────────────────────────────────────────────
  it("coalesces concurrent requests with the same key into one handler call", async () => {
    const key = uniqueKey();
    let resolveHandler!: (v: { status: number; body: unknown }) => void;
    const handlerPromise = new Promise<{ status: number; body: unknown }>(
      (res) => { resolveHandler = res; },
    );
    const handler = jest.fn(() => handlerPromise);

    // Fire two concurrent requests before the first resolves
    const [r1, r2] = await Promise.all([
      (async () => {
        const p = withIdempotency(key, USER, METHOD, PATH, handler);
        resolveHandler({ status: 201, body: { id: "coalesced" } });
        return p;
      })(),
      withIdempotency(key, USER, METHOD, PATH, handler),
    ]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(r1.body).toEqual({ id: "coalesced" });
    expect(r2.body).toEqual({ id: "coalesced" });
  });

  // ─── Non-2xx responses NOT cached ─────────────────────────────────────────
  it("does not cache a 400 response", async () => {
    const key = uniqueKey();
    const handler = jest
      .fn()
      .mockResolvedValueOnce({ status: 400, body: { error: "bad request" } })
      .mockResolvedValueOnce({ status: 201, body: { id: "ok" } });

    const first = await withIdempotency(key, USER, METHOD, PATH, handler);
    const second = await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(first.status).toBe(400);
    expect(second.status).toBe(201);
  });

  it("does not cache a 500 response", async () => {
    const key = uniqueKey();
    const handler = jest
      .fn()
      .mockResolvedValueOnce({ status: 500, body: { error: "server error" } })
      .mockResolvedValueOnce({ status: 201, body: { id: "ok" } });

    await withIdempotency(key, USER, METHOD, PATH, handler);
    const second = await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(second.status).toBe(201);
  });

  it("does not cache a 409 response", async () => {
    const key = uniqueKey();
    const handler = jest
      .fn()
      .mockResolvedValueOnce({ status: 409, body: { error: "conflict" } })
      .mockResolvedValueOnce({ status: 201, body: { id: "ok" } });

    await withIdempotency(key, USER, METHOD, PATH, handler);
    const second = await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(second.status).toBe(201);
  });

  // ─── 2xx boundary: 200 and 201 ARE cached ─────────────────────────────────
  it("caches a 200 response", async () => {
    const key = uniqueKey();
    const handler = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } });

    await withIdempotency(key, USER, METHOD, PATH, handler);
    await withIdempotency(key, USER, METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Scope isolation ──────────────────────────────────────────────────────
  it("uses separate cache entries for different users", async () => {
    const key = uniqueKey();
    const handler = jest.fn().mockResolvedValue({ status: 201, body: {} });

    await withIdempotency(key, "user-1", METHOD, PATH, handler);
    await withIdempotency(key, "user-2", METHOD, PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("uses separate cache entries for different methods", async () => {
    const key = uniqueKey();
    const handler = jest.fn().mockResolvedValue({ status: 200, body: {} });

    await withIdempotency(key, USER, "POST", PATH, handler);
    await withIdempotency(key, USER, "PATCH", PATH, handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("uses separate cache entries for different paths", async () => {
    const key = uniqueKey();
    const handler = jest.fn().mockResolvedValue({ status: 200, body: {} });

    await withIdempotency(key, USER, METHOD, "/api/tasks", handler);
    await withIdempotency(key, USER, METHOD, "/api/tasks/123", handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
