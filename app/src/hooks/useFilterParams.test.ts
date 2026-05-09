/**
 * Unit tests for useFilterParams hook.
 *
 * useSearchParams is mocked so the hook can be tested without a Next.js
 * router context.
 */
import { renderHook } from "@testing-library/react";
import { useFilterParams } from "@/hooks/useFilterParams";

// Mock next/navigation so useSearchParams works in jest-environment-jsdom
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

import { useSearchParams } from "next/navigation";
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

const defaultFilters = {
  month: 4,
  year: 2026,
  productType: "",
  squad: "",
  status: "",
};

function buildSearchParams(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe("useFilterParams — getFiltersFromUrl", () => {
  it("returns default filters when URL has no params", () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({}) as ReturnType<typeof useSearchParams>,
    );
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    expect(result.current.getFiltersFromUrl()).toEqual(defaultFilters);
  });

  it("reads month and year from URL params", () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({ month: "7", year: "2025" }) as ReturnType<
        typeof useSearchParams
      >,
    );
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    const filters = result.current.getFiltersFromUrl();
    expect(filters.month).toBe(7);
    expect(filters.year).toBe(2025);
  });

  it("reads productType, squad and status from URL params", () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        productType: "Platform",
        squad: "Alpha",
        status: "Completada",
      }) as ReturnType<typeof useSearchParams>,
    );
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    const filters = result.current.getFiltersFromUrl();
    expect(filters.productType).toBe("Platform");
    expect(filters.squad).toBe("Alpha");
    expect(filters.status).toBe("Completada");
  });
});

describe("useFilterParams — buildUrlParams", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({}) as ReturnType<typeof useSearchParams>,
    );
  });

  it("builds a query string with all provided filters", () => {
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    const qs = result.current.buildUrlParams({
      month: 3,
      year: 2026,
      productType: "Core",
      squad: "Delta",
      status: "Pendiente",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("month")).toBe("3");
    expect(params.get("year")).toBe("2026");
    expect(params.get("productType")).toBe("Core");
    expect(params.get("squad")).toBe("Delta");
    expect(params.get("status")).toBe("Pendiente");
  });

  it("omits falsy values from the query string", () => {
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    const qs = result.current.buildUrlParams({
      month: 5,
      year: 2026,
      productType: "",
      squad: "",
      status: "",
    });
    const params = new URLSearchParams(qs);
    expect(params.has("productType")).toBe(false);
    expect(params.has("squad")).toBe(false);
    expect(params.has("status")).toBe(false);
  });

  it("returns empty string when no filters are set", () => {
    const { result } = renderHook(() => useFilterParams(defaultFilters));
    expect(result.current.buildUrlParams({})).toBe("");
  });
});
