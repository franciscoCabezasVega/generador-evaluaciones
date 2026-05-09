import { withTimeout, TimeoutError } from "@/lib/withTimeout";

jest.useFakeTimers();

describe("withTimeout", () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it("resolves with the value when promise completes before timeout", async () => {
    const promise = Promise.resolve(42);
    const result = await withTimeout(promise, 1000);
    expect(result).toBe(42);
  });

  it("rejects with TimeoutError when promise exceeds timeout", async () => {
    const neverResolves = new Promise<never>(() => {});
    const racePromise = withTimeout(neverResolves, 500);
    jest.advanceTimersByTime(500);
    await expect(racePromise).rejects.toThrow(TimeoutError);
  });

  it("TimeoutError message includes the timeout duration", async () => {
    const neverResolves = new Promise<never>(() => {});
    const racePromise = withTimeout(neverResolves, 3000);
    jest.advanceTimersByTime(3000);
    await expect(racePromise).rejects.toThrow("3000ms");
  });

  it("propagates the original error if promise rejects before timeout", async () => {
    const customError = new Error("custom failure");
    const failingPromise = Promise.reject(customError);
    await expect(withTimeout(failingPromise, 1000)).rejects.toThrow(
      "custom failure",
    );
  });

  it("clears the timeout timer on successful resolution", async () => {
    const spy = jest.spyOn(global, "clearTimeout");
    await withTimeout(Promise.resolve("ok"), 5000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("uses 10000ms default timeout when not specified", async () => {
    const neverResolves = new Promise<never>(() => {});
    const racePromise = withTimeout(neverResolves);
    jest.advanceTimersByTime(9999);
    // Not yet rejected
    jest.advanceTimersByTime(1);
    await expect(racePromise).rejects.toThrow(TimeoutError);
  });
});

describe("TimeoutError", () => {
  it("is an instance of Error", () => {
    const err = new TimeoutError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has name TimeoutError", () => {
    const err = new TimeoutError();
    expect(err.name).toBe("TimeoutError");
  });

  it("uses default message when none is provided", () => {
    const err = new TimeoutError();
    expect(err.message).toBe("Request timeout");
  });

  it("uses custom message when provided", () => {
    const err = new TimeoutError("timed out after 5s");
    expect(err.message).toBe("timed out after 5s");
  });
});
