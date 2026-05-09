import { act, renderHook } from "@testing-library/react";
import { useDebounce, useDebouncedCallback } from "@/hooks/useDebounce";

jest.useFakeTimers();

describe("useDebounce", () => {
  afterEach(() => jest.clearAllTimers());

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("does not update the value before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "first" } },
    );
    rerender({ value: "second" });
    jest.advanceTimersByTime(299);
    expect(result.current).toBe("first");
  });

  it("updates the value after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "first" } },
    );
    rerender({ value: "second" });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe("second");
  });

  it("resets the timer when the value changes quickly (leading-edge cancel)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    jest.advanceTimersByTime(200);
    rerender({ value: "c" });
    jest.advanceTimersByTime(200); // Only 200ms since last change
    expect(result.current).toBe("a"); // Not yet updated
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe("c"); // Final value after full debounce
  });
});

describe("useDebouncedCallback", () => {
  afterEach(() => jest.clearAllTimers());

  it("does not invoke the callback immediately", () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));
    result.current("arg");
    expect(callback).not.toHaveBeenCalled();
  });

  it("invokes the callback after the delay", () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));
    result.current("argA");
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledWith("argA");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancels previous call when invoked again before delay", () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));
    result.current("first");
    jest.advanceTimersByTime(100);
    result.current("second");
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("second");
  });
});
