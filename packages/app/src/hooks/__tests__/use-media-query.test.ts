/**
 * useMediaQuery Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "../use-media-query";

describe("useMediaQuery", () => {
  let mediaQueryListeners: Map<string, ((e: MediaQueryListEvent) => void)[]>;
  let mediaQueryMatches: Map<string, boolean>;

  beforeEach(() => {
    mediaQueryListeners = new Map();
    mediaQueryMatches = new Map();

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: mediaQueryMatches.get(query) || false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(
          (event: string, listener: (e: MediaQueryListEvent) => void) => {
            if (!mediaQueryListeners.has(query)) {
              mediaQueryListeners.set(query, []);
            }
            mediaQueryListeners.get(query)!.push(listener);
          },
        ),
        removeEventListener: vi.fn(
          (event: string, listener: (e: MediaQueryListEvent) => void) => {
            const listeners = mediaQueryListeners.get(query) || [];
            const index = listeners.indexOf(listener);
            if (index > -1) {
              listeners.splice(index, 1);
            }
          },
        ),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return false when media query does not match", () => {
    mediaQueryMatches.set("(min-width: 768px)", false);

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);
  });

  it("should return true when media query matches", () => {
    mediaQueryMatches.set("(min-width: 768px)", true);

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("should update when media query changes", async () => {
    mediaQueryMatches.set("(min-width: 768px)", false);

    const { result, rerender } = renderHook(() =>
      useMediaQuery("(min-width: 768px)"),
    );

    expect(result.current).toBe(false);

    // Simulate media query change
    mediaQueryMatches.set("(min-width: 768px)", true);
    const listeners = mediaQueryListeners.get("(min-width: 768px)") || [];

    act(() => {
      listeners.forEach((listener) => {
        listener({ matches: true } as MediaQueryListEvent);
      });
    });

    expect(result.current).toBe(true);
  });

  it("should handle different queries", () => {
    mediaQueryMatches.set("(min-width: 640px)", true);
    mediaQueryMatches.set("(min-width: 1024px)", false);

    const { result: result1 } = renderHook(() =>
      useMediaQuery("(min-width: 640px)"),
    );
    const { result: result2 } = renderHook(() =>
      useMediaQuery("(min-width: 1024px)"),
    );

    expect(result1.current).toBe(true);
    expect(result2.current).toBe(false);
  });

  it("should sync state when query prop changes", () => {
    // Start with one query
    mediaQueryMatches.set("(min-width: 768px)", false);
    mediaQueryMatches.set("(min-width: 1024px)", true);

    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      {
        initialProps: { query: "(min-width: 768px)" },
      },
    );

    expect(result.current).toBe(false);

    // Change the query prop
    rerender({ query: "(min-width: 1024px)" });

    // Should update to match the new query
    expect(result.current).toBe(true);
  });
});
