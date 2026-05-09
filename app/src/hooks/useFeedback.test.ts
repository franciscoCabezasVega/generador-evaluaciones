import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import * as React from "react";
import { useFeedback } from "./useFeedback";
import { EvidenceItem } from "@/lib/types";

// Mock authenticatedFetch para evitar dependencia de Next.js Request en tests
jest.mock("@/lib/fetchAuth", () => ({
  authenticatedFetch: jest.fn((url: string, options?: RequestInit) =>
    global.fetch(url, options),
  ),
  warmSession: jest.fn().mockResolvedValue(undefined),
}));

// Añadir act al global para compatibilidad con React 19
beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  if (!React.act) {
    (React as typeof React & { act?: typeof act }).act = act;
  }
});

describe("useFeedback Hook", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    // Sincronizar el mock de authenticatedFetch con global.fetch
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { authenticatedFetch } = require("@/lib/fetchAuth");
    (authenticatedFetch as jest.Mock).mockImplementation(
      (url: string, options?: RequestInit) => global.fetch(url, options),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Validation Tests", () => {
    it("should reject description less than 10 characters", async () => {
      const { result } = renderHook(() => useFeedback());

      await act(async () => {
        result.current.submitFeedback("suggestion", "short");
      });

      await waitFor(() => {
        expect(result.current.error).toBe(
          "La descripción debe tener al menos 10 caracteres",
        );
      });
    });

    it("should reject more than 3 evidence items", async () => {
      const { result } = renderHook(() => useFeedback());

      const evidence: EvidenceItem[] = Array.from({ length: 4 }, (_, i) => ({
        type: "link" as const,
        value: `https://example.com/${i}`,
      }));

      await act(async () => {
        result.current.submitFeedback(
          "suggestion",
          "This is a valid description",
          evidence,
        );
      });

      await waitFor(() => {
        expect(result.current.error).toBe(
          "Se permite un máximo de 3 elementos de evidencia",
        );
      });
    });

    it("should reject invalid jam.dev URL", async () => {
      const { result } = renderHook(() => useFeedback());

      const evidence: EvidenceItem[] = [
        {
          type: "link",
          value: "https://github.com/invalid-url",
        },
      ];

      await act(async () => {
        result.current.submitFeedback(
          "suggestion",
          "This is a valid description",
          evidence,
        );
      });

      await waitFor(() => {
        expect(result.current.error).toContain("El enlace debe ser de jam.dev");
      });
    });

    it("should reject empty description", async () => {
      const { result } = renderHook(() => useFeedback());

      await act(async () => {
        result.current.submitFeedback("suggestion", "");
      });

      await waitFor(() => {
        expect(result.current.error).toContain("10 caracteres");
      });
    });

    it("should accept valid suggestion without evidence", async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useFeedback({ onSuccess }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Success" }),
      });

      await act(async () => {
        result.current.submitFeedback("suggestion", "Valid description here");
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("should accept valid suggestion with image evidence", async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useFeedback({ onSuccess }));

      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
      const evidence: EvidenceItem[] = [
        {
          type: "image",
          value: mockFile,
          description: "Test image",
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Success" }),
      });

      await act(async () => {
        result.current.submitFeedback(
          "suggestion",
          "Valid description here",
          evidence,
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("should accept valid incident with video link", async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useFeedback({ onSuccess }));

      const evidence: EvidenceItem[] = [
        {
          type: "video",
          value: "https://example.com/video.mp4",
          description: "Bug recording",
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Success" }),
      });

      await act(async () => {
        result.current.submitFeedback(
          "incident",
          "Valid description here",
          evidence,
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("should accept valid report with Jam link", async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useFeedback({ onSuccess }));

      const evidence: EvidenceItem[] = [
        {
          type: "link",
          value: "https://jam.dev/c/uuid-123",
          description: "Jam link with details",
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Success" }),
      });

      await act(async () => {
        result.current.submitFeedback(
          "suggestion",
          "Valid description here",
          evidence,
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe("API Error Handling", () => {
    it("should handle API errors", async () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useFeedback({ onError }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Server error" }),
      });

      await act(async () => {
        result.current.submitFeedback("suggestion", "Valid description here");
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith("Server error");
      });
    });

    it("should call correct API endpoint", async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { authenticatedFetch } = require("@/lib/fetchAuth");
      const { result } = renderHook(() => useFeedback());

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Success" }),
      });

      await act(async () => {
        result.current.submitFeedback("suggestion", "Valid description here");
      });

      await waitFor(() => {
        expect(authenticatedFetch).toHaveBeenCalledWith(
          "/api/feedback",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "suggestion",
              description: "Valid description here",
            }),
          }),
        );
      });
    });
  });

  describe("clearError Method", () => {
    it("should clear error", async () => {
      const { result } = renderHook(() => useFeedback());

      await act(async () => {
        result.current.submitFeedback("suggestion", "short");
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      await act(async () => {
        result.current.clearError();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });
});
