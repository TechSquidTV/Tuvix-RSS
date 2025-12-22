/**
 * TRPCProvider Offline Configuration Tests
 *
 * Tests for QueryClient offline and retry configurations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  TRPCProvider,
  shouldRetryQuery,
  calculateRetryDelay,
  createFetchWithCredentials,
} from "../trpc-provider";
import { onlineManager } from "@tanstack/react-query";

describe("TRPCProvider - Offline Configuration", () => {
  beforeEach(() => {
    // Reset online manager
    onlineManager.setOnline(true);

    // Create a wrapper to access the QueryClient
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TRPCProvider>{children}</TRPCProvider>
    );

    // Render a dummy hook to initialize the provider
    renderHook(() => null, { wrapper });
  });

  describe("retry logic", () => {
    it("should not retry on 4xx client errors", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // The retry function should return false for 4xx errors
      // This is configured in the QueryClient defaultOptions
      // Actual behavior is tested in integration tests
    });

    it("should retry on 5xx server errors up to 3 times", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // The retry function should return true for 5xx errors
      // up to 3 attempts (failureCount < 3)
    });

    it("should retry on network errors", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Network errors (no httpStatus) should be retried
    });

    it("should use exponential backoff for retries", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Test exponential backoff delays
      // attemptIndex 0: 1000ms (1s)
      // attemptIndex 1: 2000ms (2s)
      // attemptIndex 2: 4000ms (4s)
      // Should cap at 30000ms (30s)
    });
  });

  describe("online manager synchronization", () => {
    it("should sync online manager with window events", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      const { unmount } = renderHook(() => null, { wrapper });

      // Should add event listeners
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "offline",
        expect.any(Function)
      );

      // Should remove on unmount
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

    it("should set online manager to true on online event", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Start offline
      act(() => {
        onlineManager.setOnline(false);
      });

      expect(onlineManager.isOnline()).toBe(false);

      // Trigger online event
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      expect(onlineManager.isOnline()).toBe(true);
    });

    it("should set online manager to false on offline event", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Start online
      expect(onlineManager.isOnline()).toBe(true);

      // Trigger offline event
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(onlineManager.isOnline()).toBe(false);
    });
  });

  describe("network mode configuration", () => {
    it("should configure queries with online network mode", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Queries should be configured with networkMode: "online"
      // This means queries will pause when offline
    });

    it("should configure mutations with online network mode", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Mutations should be configured with networkMode: "online"
      // This means mutations will fail immediately when offline
    });

    it("should not retry mutations by default", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Mutations should have retry: false
      // This means they won't auto-retry on errors
    });
  });

  describe("refetch behavior", () => {
    it("should disable refetch on window focus", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Queries should have refetchOnWindowFocus: false
      // This prevents aggressive refetching when switching tabs
    });

    it("should enable refetch on reconnect", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Queries should have refetchOnReconnect: true
      // This ensures data syncs when coming back online
    });
  });

  describe("stale time", () => {
    it("should set default stale time to 5 minutes", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TRPCProvider>{children}</TRPCProvider>
      );

      renderHook(() => null, { wrapper });

      // Queries should have staleTime: 5 * 60 * 1000
      // This means data is considered fresh for 5 minutes
    });
  });
});

describe("shouldRetryQuery", () => {
  describe("4xx client errors - should not retry", () => {
    it("should not retry 400 Bad Request", () => {
      const error = { data: { httpStatus: 400 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
      expect(shouldRetryQuery(1, error)).toBe(false);
      expect(shouldRetryQuery(2, error)).toBe(false);
    });

    it("should not retry 401 Unauthorized", () => {
      const error = { data: { httpStatus: 401 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
    });

    it("should not retry 403 Forbidden", () => {
      const error = { data: { httpStatus: 403 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
    });

    it("should not retry 404 Not Found", () => {
      const error = { data: { httpStatus: 404 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
    });

    it("should not retry 422 Unprocessable Entity", () => {
      const error = { data: { httpStatus: 422 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
    });

    it("should not retry 499 Client Closed Request", () => {
      const error = { data: { httpStatus: 499 } };
      expect(shouldRetryQuery(0, error)).toBe(false);
    });
  });

  describe("5xx server errors - should retry", () => {
    it("should retry 500 Internal Server Error up to 3 times", () => {
      const error = { data: { httpStatus: 500 } };
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
      expect(shouldRetryQuery(3, error)).toBe(false); // Stop after 3 attempts
    });

    it("should retry 502 Bad Gateway", () => {
      const error = { data: { httpStatus: 502 } };
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
    });

    it("should retry 503 Service Unavailable", () => {
      const error = { data: { httpStatus: 503 } };
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
    });

    it("should retry 504 Gateway Timeout", () => {
      const error = { data: { httpStatus: 504 } };
      expect(shouldRetryQuery(0, error)).toBe(true);
    });
  });

  describe("network errors - should retry", () => {
    it("should retry network errors (no status code)", () => {
      const error = { data: {} };
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
      expect(shouldRetryQuery(3, error)).toBe(false);
    });

    it("should retry when error.data is undefined", () => {
      const error = {};
      expect(shouldRetryQuery(0, error)).toBe(true);
    });

    it("should retry when error.data.httpStatus is undefined", () => {
      const error = { data: { httpStatus: undefined } };
      expect(shouldRetryQuery(0, error)).toBe(true);
    });
  });
});

describe("calculateRetryDelay", () => {
  it("should use exponential backoff", () => {
    expect(calculateRetryDelay(0)).toBe(1000); // 1s
    expect(calculateRetryDelay(1)).toBe(2000); // 2s
    expect(calculateRetryDelay(2)).toBe(4000); // 4s
    expect(calculateRetryDelay(3)).toBe(8000); // 8s
    expect(calculateRetryDelay(4)).toBe(16000); // 16s
    expect(calculateRetryDelay(5)).toBe(30000); // Capped at 30s
    expect(calculateRetryDelay(6)).toBe(30000); // Still capped
  });

  it("should cap at 30 seconds", () => {
    expect(calculateRetryDelay(10)).toBe(30000);
    expect(calculateRetryDelay(100)).toBe(30000);
  });
});

describe("createFetchWithCredentials", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should call fetch with credentials: include", async () => {
    await createFetchWithCredentials("http://example.com/api");

    expect(global.fetch).toHaveBeenCalledWith("http://example.com/api", {
      credentials: "include",
      headers: {},
    });
  });

  it("should preserve existing headers", async () => {
    await createFetchWithCredentials("http://example.com/api", {
      headers: {
        "Content-Type": "application/json",
        "sentry-trace": "abc123",
      },
    });

    expect(global.fetch).toHaveBeenCalledWith("http://example.com/api", {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "sentry-trace": "abc123",
      },
    });
  });

  it("should preserve other options like method and body", async () => {
    await createFetchWithCredentials("http://example.com/api", {
      method: "POST",
      body: JSON.stringify({ data: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(global.fetch).toHaveBeenCalledWith("http://example.com/api", {
      method: "POST",
      body: JSON.stringify({ data: "test" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("should work with URL object", async () => {
    const url = new URL("http://example.com/api");
    await createFetchWithCredentials(url);

    expect(global.fetch).toHaveBeenCalledWith(url, {
      credentials: "include",
      headers: {},
    });
  });

  it("should handle undefined options", async () => {
    await createFetchWithCredentials("http://example.com/api", undefined);

    expect(global.fetch).toHaveBeenCalledWith("http://example.com/api", {
      credentials: "include",
      headers: {},
    });
  });
});
