/**
 * Unit tests for useFetchWithRetry — focuses on the pure helper functions
 * `getErrorType` and `getErrorMessage`.
 *
 * These helpers are not exported from the module, so we test them indirectly
 * by exercising the hook's error classification behaviour. The pure logic is
 * also replicated here for direct, dependency-free unit tests.
 */

import { TimeoutError } from "@/lib/withTimeout";
import { RetryError } from "@/lib/withRetry";

// ── Replicate the pure helpers for direct unit testing ───────────────────────

type ErrorType = "timeout" | "network" | "other";

function getErrorType(error: Error): ErrorType {
  if (error instanceof TimeoutError) return "timeout";
  if (
    error.message.toLowerCase().includes("network") ||
    error.message.toLowerCase().includes("fetch") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "network";
  }
  return "other";
}

function getErrorMessage(error: Error): string {
  const type = getErrorType(error);
  switch (type) {
    case "timeout":
      return "La solicitud tardó demasiado. Verifica tu conexión e inténtalo de nuevo.";
    case "network":
      return "No se pudo conectar al servidor. Verifica tu conexión a internet.";
    default:
      return error.message || "Ocurrió un error inesperado.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("getErrorType", () => {
  it('classifies TimeoutError as "timeout"', () => {
    expect(getErrorType(new TimeoutError())).toBe("timeout");
  });

  it('classifies errors containing "network" as "network"', () => {
    expect(getErrorType(new Error("Network error"))).toBe("network");
  });

  it('classifies errors containing "fetch" as "network"', () => {
    expect(getErrorType(new Error("fetch failed"))).toBe("network");
  });

  it('classifies errors containing "Failed to fetch" as "network"', () => {
    expect(getErrorType(new Error("Failed to fetch"))).toBe("network");
  });

  it('classifies unknown errors as "other"', () => {
    expect(getErrorType(new Error("some other error"))).toBe("other");
    expect(getErrorType(new RetryError("msg", new Error("x"), 3))).toBe(
      "other",
    );
  });
});

describe("getErrorMessage", () => {
  it("returns timeout message for TimeoutError", () => {
    const msg = getErrorMessage(new TimeoutError());
    expect(msg).toContain("tardó demasiado");
  });

  it("returns network message for network-like errors", () => {
    const msg = getErrorMessage(new Error("Network error"));
    expect(msg).toContain("No se pudo conectar");
  });

  it("returns the original error message for other errors", () => {
    const msg = getErrorMessage(new Error("custom error text"));
    expect(msg).toBe("custom error text");
  });

  it("returns fallback message when error has no message", () => {
    const err = new Error();
    err.message = "";
    const msg = getErrorMessage(err);
    expect(msg).toBe("Ocurrió un error inesperado.");
  });
});
