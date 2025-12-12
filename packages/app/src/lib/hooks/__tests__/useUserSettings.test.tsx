/**
 * useUserSettings Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createWrapper } from "@/test/test-utils";
import * as useNetworkStatusModule from "@/hooks/use-network-status";

// Mock the useNetworkStatus hook
vi.mock("@/hooks/use-network-status");

// Mock sonner for toast notifications
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the hooks after mocks are set up
const { useUserSettings, useUpdateUserSettings, useUserUsage } = await import(
  "../useUserSettings"
);

describe("useUserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
      isOnline: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useUserSettings).toBeDefined();
    expect(typeof useUserSettings).toBe("function");
  });

  it("should return a query result", () => {
    const { result } = renderHook(() => useUserSettings(), {
      wrapper: createWrapper(),
    });

    // The hook should return query properties
    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("error");
  });
});

describe("useUpdateUserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
      isOnline: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useUpdateUserSettings).toBeDefined();
    expect(typeof useUpdateUserSettings).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useUpdateUserSettings(), {
      wrapper: createWrapper(),
    });

    // The hook should return mutation properties
    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useUserUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
      isOnline: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useUserUsage).toBeDefined();
    expect(typeof useUserUsage).toBe("function");
  });

  it("should return a query result", () => {
    const { result } = renderHook(() => useUserUsage(), {
      wrapper: createWrapper(),
    });

    // The hook should return query properties
    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("isLoading");
  });
});
