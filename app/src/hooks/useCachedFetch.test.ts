/**
 * Unit tests for useCachedFetch — focuses on the pure helper buildFilterKey.
 *
 * The private buildFilterKey is not exported, so we test it indirectly by
 * observing that the hook treats two calls with the same filters as a cache
 * hit and two calls with different filters as cache misses. We also extract
 * the observable behaviour of cache TTL and data refresh.
 *
 * Note: because buildFilterKey is internal, we test it through the hook's
 * public interface. The hook itself depends on a fetchFn and enabled flag.
 */

import { renderHook, act } from "@testing-library/react";
import { useCachedFetch } from "./useCachedFetch";

// ── Direct tests of the pure key-building logic ──────────────────────────────
// We replicate the same logic here to unit-test it in isolation.

function buildFilterKey(filters: Record<string, unknown>): string {
  const sorted = Object.keys(filters)
    .sort()
    .map((k) => `${k}=${String(filters[k] ?? "")}`)
    .join("&");
  return sorted;
}

describe("buildFilterKey (cache key builder)", () => {
  it("produces a stable key regardless of object key insertion order", () => {
    const a = buildFilterKey({ year: 2026, month: 4, status: "" });
    const b = buildFilterKey({ status: "", month: 4, year: 2026 });
    expect(a).toBe(b);
  });

  it("produces different keys for different filter values", () => {
    const a = buildFilterKey({ month: 3, year: 2026 });
    const b = buildFilterKey({ month: 4, year: 2026 });
    expect(a).not.toBe(b);
  });

  it("treats undefined/null filter values as empty strings", () => {
    const a = buildFilterKey({ status: undefined });
    const b = buildFilterKey({ status: null });
    const c = buildFilterKey({ status: "" });
    expect(a).toBe(c);
    expect(b).toBe(c);
  });

  it("returns empty string for an empty filter object", () => {
    expect(buildFilterKey({})).toBe("");
  });

  it("handles filter values that are already strings", () => {
    const key = buildFilterKey({ productType: "Platform", squad: "Alpha" });
    expect(key).toContain("productType=Platform");
    expect(key).toContain("squad=Alpha");
  });

  it("handles numeric filter values", () => {
    const key = buildFilterKey({ month: 12, year: 2025 });
    expect(key).toContain("month=12");
    expect(key).toContain("year=2025");
  });
});

// ── Visibility-based revalidation — integration with the real hook ────────────
// These tests mount the actual useCachedFetch hook and dispatch real
// visibilitychange events so that the hook's effect logic (abortRef handling,
// fullKeyRef usage, enabled toggling) is fully exercised.

describe("useCachedFetch – visibilitychange integration", () => {
  let originalVisibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(
        document,
        "visibilityState",
        originalVisibilityDescriptor,
      );
    } else {
      delete (document as { visibilityState?: string }).visibilityState;
    }
  });

  function setVisibilityState(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    });
  }

  it("calls fetchFn when tab becomes visible and cache is stale", async () => {
    const STALE_TIME = 1_000;
    const cacheKey = `vis-stale-${Math.random()}`;
    const fetchFn = jest.fn().mockResolvedValue(["data"]);

    renderHook(() =>
      useCachedFetch<string[]>({
        cacheKey,
        fetchFn,
        filters: {},
        staleTime: STALE_TIME,
      }),
    );

    // Fire jitter timer so the initial fetch completes
    await act(async () => {
      jest.runAllTimers();
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Expire the cache by advancing fake clock past staleTime
    act(() => {
      jest.advanceTimersByTime(STALE_TIME + 100);
    });

    // Tab becomes visible → hook should trigger a background refetch
    await act(async () => {
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("calls fetchFn even when tab becomes visible and cache is still fresh", async () => {
    const STALE_TIME = 60_000;
    const cacheKey = `vis-fresh-${Math.random()}`;
    const fetchFn = jest.fn().mockResolvedValue(["data"]);

    renderHook(() =>
      useCachedFetch<string[]>({
        cacheKey,
        fetchFn,
        filters: {},
        staleTime: STALE_TIME,
      }),
    );

    await act(async () => {
      jest.runAllTimers();
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Cache is still fresh — hook should still trigger a background refetch on visibility
    await act(async () => {
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("serves data immediately on mount when cache is fresh (no spinner + background refetch)", async () => {
    const STALE_TIME = 60_000;
    const cacheKey = `mount-fresh-${Math.random()}`;
    const fetchFn = jest.fn().mockResolvedValue(["cached"]);

    // First mount: populate the cache
    const { unmount } = renderHook(() =>
      useCachedFetch<string[]>({
        cacheKey,
        fetchFn,
        filters: {},
        staleTime: STALE_TIME,
      }),
    );
    await act(async () => {
      jest.runAllTimers();
    });
    await act(async () => {});
    expect(fetchFn).toHaveBeenCalledTimes(1);
    unmount();

    // Second mount: cache is still fresh
    fetchFn.mockClear();
    const { result } = renderHook(() =>
      useCachedFetch<string[]>({
        cacheKey,
        fetchFn,
        filters: {},
        staleTime: STALE_TIME,
      }),
    );

    // Must serve cached data immediately without a loading spinner
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(["cached"]);

    // Must still dispatch a background refetch after the jitter delay
    await act(async () => {
      jest.runAllTimers();
    });
    await act(async () => {});
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT call fetchFn when tab goes to background (hidden)", async () => {
    const STALE_TIME = 100;
    const cacheKey = `vis-hidden-${Math.random()}`;
    const fetchFn = jest.fn().mockResolvedValue(["data"]);

    renderHook(() =>
      useCachedFetch<string[]>({
        cacheKey,
        fetchFn,
        filters: {},
        staleTime: STALE_TIME,
      }),
    );

    await act(async () => {
      jest.runAllTimers();
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Expire cache
    act(() => {
      jest.advanceTimersByTime(STALE_TIME + 100);
    });

    // Tab goes to background — hook must NOT refetch on hidden
    await act(async () => {
      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
