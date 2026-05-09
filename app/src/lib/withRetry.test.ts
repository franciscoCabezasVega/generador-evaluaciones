import { withRetry, RetryError } from "@/lib/withRetry";

jest.useFakeTimers();

/**
 * Helper that creates a jest.fn() which succeeds on the Nth call.
 * Calls 1..(n-1) throw `failMsg`; call n returns `value`.
 */
function succeedsOnAttempt<T>(
  n: number,
  value: T,
  failMsg = "transient error",
) {
  let calls = 0;
  return jest.fn(async () => {
    calls++;
    if (calls < n) throw new Error(failMsg);
    return value;
  });
}

describe("withRetry", () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  it("returns the value when the function succeeds on the first attempt", async () => {
    const fn = jest.fn().mockResolvedValue("hello");
    const result = await withRetry(fn, {
      maxRetries: 3,
      timeoutMs: 5000,
      initialBackoffMs: 0,
    });
    expect(result).toBe("hello");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds on the second attempt", async () => {
    const fn = succeedsOnAttempt(2, "second");
    const promise = withRetry(fn, {
      maxRetries: 3,
      timeoutMs: 5000,
      initialBackoffMs: 10,
    });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws RetryError after exhausting all attempts", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"));
    const promise = withRetry(fn, {
      maxRetries: 3,
      timeoutMs: 5000,
      initialBackoffMs: 10,
    });
    // Attach rejection handler BEFORE advancing timers to prevent unhandled rejection
    const assertion = expect(promise).rejects.toThrow(RetryError);
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("RetryError preserves the last error and attempt count", async () => {
    const lastError = new Error("last error message");
    const fn = jest.fn().mockRejectedValue(lastError);
    const promise = withRetry(fn, {
      maxRetries: 2,
      timeoutMs: 5000,
      initialBackoffMs: 10,
    });
    // Attach rejection handler synchronously to prevent unhandled rejection window
    const caught = promise.catch((err: unknown) => err);
    await jest.runAllTimersAsync();
    const err = await caught;
    expect(err).toBeInstanceOf(RetryError);
    expect((err as RetryError).lastError).toBe(lastError);
    expect((err as RetryError).attempts).toBe(2);
  });

  it("calls onRetry callback with attempt number and error on each retry", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fail"));
    const onRetry = jest.fn();
    const promise = withRetry(fn, {
      maxRetries: 3,
      timeoutMs: 5000,
      initialBackoffMs: 10,
      onRetry,
    });
    // Attach rejection handler BEFORE advancing timers
    const consumed = promise.catch(() => {});
    await jest.runAllTimersAsync();
    await consumed;
    // onRetry called for attempts 1 and 2 (not on the last failed attempt)
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });

  it("respects maxRetries=1 (single attempt, no retries)", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fail"));
    const promise = withRetry(fn, {
      maxRetries: 1,
      timeoutMs: 5000,
      initialBackoffMs: 10,
    });
    // Attach rejection handler BEFORE advancing timers
    const assertion = expect(promise).rejects.toThrow(RetryError);
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("converts non-Error thrown values to Error in RetryError.lastError", async () => {
    const fn = jest.fn().mockRejectedValue("string error");
    const promise = withRetry(fn, {
      maxRetries: 1,
      timeoutMs: 5000,
      initialBackoffMs: 0,
    });
    // Attach rejection handler BEFORE advancing timers
    const caught = promise.catch((err: unknown) => err);
    await jest.runAllTimersAsync();
    const err = await caught;
    expect((err as RetryError).lastError).toBeInstanceOf(Error);
  });
});

describe("RetryError", () => {
  it("is an instance of Error", () => {
    const err = new RetryError("msg", new Error("last"), 3);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name RetryError", () => {
    const err = new RetryError("msg", new Error("last"), 3);
    expect(err.name).toBe("RetryError");
  });
});
