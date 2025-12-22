/**
 * useNetworkStatus Hook Tests
 *
 * Tests for network status detection and monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus, useIsSlowConnection } from "../use-network-status";

describe("useNetworkStatus", () => {
  beforeEach(() => {
    // Reset navigator.onLine to true before each test
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    // Mock connection API
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("online/offline detection", () => {
    it("should return online status initially", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);
    });

    it("should update to offline when offline event is fired", async () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);

      // Simulate going offline
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        window.dispatchEvent(new Event("offline"));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it("should update to online when online event is fired", async () => {
      // Start offline
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);

      // Simulate going online
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: true,
        });
        window.dispatchEvent(new Event("online"));
      });

      expect(result.current.isOnline).toBe(true);
    });

    it("should handle multiple online/offline transitions", () => {
      const { result } = renderHook(() => useNetworkStatus());

      // Go offline
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        window.dispatchEvent(new Event("offline"));
      });
      expect(result.current.isOnline).toBe(false);

      // Go online
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: true,
        });
        window.dispatchEvent(new Event("online"));
      });
      expect(result.current.isOnline).toBe(true);

      // Go offline again
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        window.dispatchEvent(new Event("offline"));
      });
      expect(result.current.isOnline).toBe(false);
    });
  });

  describe("connection information", () => {
    it("should return connection info when available", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.effectiveType).toBe("4g");
      expect(result.current.downlink).toBe(10);
      expect(result.current.rtt).toBe(50);
    });

    it("should handle missing connection API gracefully", () => {
      // Remove connection API
      Object.defineProperty(navigator, "connection", {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);
      expect(result.current.effectiveType).toBeUndefined();
      expect(result.current.downlink).toBeUndefined();
      expect(result.current.rtt).toBeUndefined();
    });

    it("should update connection info when connection changes", () => {
      const connection = {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "connection", {
        writable: true,
        value: connection,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.effectiveType).toBe("4g");

      // Simulate connection change
      act(() => {
        connection.effectiveType = "3g";
        connection.downlink = 2;
        connection.rtt = 200;

        // Get the change listener that was registered
        const changeListener = connection.addEventListener.mock.calls.find(
          (call) => call[0] === "change"
        )?.[1];

        if (changeListener) {
          changeListener();
        }
      });

      expect(result.current.effectiveType).toBe("3g");
      expect(result.current.downlink).toBe(2);
      expect(result.current.rtt).toBe(200);
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on unmount", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useNetworkStatus());

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "offline",
        expect.any(Function)
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "offline",
        expect.any(Function)
      );
    });
  });
});

describe("useIsSlowConnection", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
  });

  it("should return false for 4g connection", () => {
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: {
        effectiveType: "4g",
        rtt: 50,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(false);
  });

  it("should return true for 2g connection", () => {
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: {
        effectiveType: "2g",
        rtt: 500,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(true);
  });

  it("should return true for slow-2g connection", () => {
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: {
        effectiveType: "slow-2g",
        rtt: 1000,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(true);
  });

  it("should return true for high RTT even with 4g", () => {
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: {
        effectiveType: "4g",
        rtt: 1500, // Very high latency
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(true);
  });

  it("should return false when connection API is unavailable", () => {
    Object.defineProperty(navigator, "connection", {
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(false);
  });
});
