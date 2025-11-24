/**
 * App Route Offline Navigation Tests
 *
 * Tests for route protection behavior when offline
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as authClientModule from "@/lib/auth-client";

// Mock dependencies
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");

  // Create a special redirect error class that can be identified
  class RedirectError extends Error {
    constructor(public to: string) {
      super(`redirect:${to}`);
      this.name = "RedirectError";
    }
  }

  return {
    ...actual,
    redirect: vi.fn((options) => {
      const error = new RedirectError(options.to);
      // Mark it as a redirect so the route can identify it
      (error as any).isRedirect = true;
      return error;
    }),
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
  },
}));

// Mock tRPC client to avoid URL parsing issues in tests
const mockCheckVerificationStatus = vi.fn().mockResolvedValue({
  requiresVerification: false,
  emailVerified: true,
});

vi.mock("@trpc/client", async () => {
  return {
    createTRPCClient: vi.fn(() => ({
      auth: {
        checkVerificationStatus: {
          query: mockCheckVerificationStatus,
        },
      },
    })),
    httpBatchLink: vi.fn(() => () => {}),
  };
});

// Mock fetch globally to handle any fetch calls (fallback in case tRPC mock doesn't work)
const originalFetch = global.fetch;
global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
  // If it's a relative URL, convert it to absolute for Node.js
  const urlString =
    typeof url === "string"
      ? url
      : url instanceof URL
        ? url.toString()
        : url.url;
  
  // Create mock response with proper Content-Type header
  const mockResponse = {
    ok: true,
    status: 200,
    headers: {
      get: vi.fn().mockReturnValue("application/json"),
    },
    json: vi.fn().mockResolvedValue({
      result: {
        data: {
          requiresVerification: false,
          emailVerified: true,
        },
      },
    }),
  } as any;
  
  if (urlString.startsWith("/")) {
    return Promise.resolve(mockResponse);
  }
  // For absolute URLs, use original fetch or return mock
  return Promise.resolve(mockResponse);
});

// Mock import.meta.env to provide absolute URL
const originalEnv = import.meta.env;
Object.defineProperty(import.meta, "env", {
  value: {
    ...originalEnv,
    VITE_API_URL: "http://localhost:3001/trpc",
  },
  writable: true,
  configurable: true,
});

// Import the route module to test beforeLoad
const routeModule = await import("../../routes/app/route");

describe("App Route - Offline Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Reset mocks
    mockCheckVerificationStatus.mockResolvedValue({
      requiresVerification: false,
      emailVerified: true,
    });
  });

  describe("session validation", () => {
    it("should redirect when no session exists", async () => {
      vi.mocked(authClientModule.authClient.getSession).mockResolvedValue(null);

      await expect(routeModule.Route.options.beforeLoad?.({})).rejects.toThrow(
        "redirect:/",
      );

      expect(authClientModule.authClient.getSession).toHaveBeenCalled();
    });

    it("should redirect when session has no user", async () => {
      vi.mocked(authClientModule.authClient.getSession).mockResolvedValue({
        data: { user: null },
      } as any);

      await expect(routeModule.Route.options.beforeLoad?.({})).rejects.toThrow(
        "redirect:/",
      );
    });
  });

  describe("offline navigation (navigator.onLine = false)", () => {
    it("should allow navigation with valid session when offline", async () => {
      vi.mocked(authClientModule.authClient.getSession).mockResolvedValue({
        data: { user: { id: "1", email: "test@example.com" } },
      } as any);

      // Mock navigator.onLine
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const result = await routeModule.Route.options.beforeLoad?.({});

      expect(result).toBeUndefined();
    });
  });

  describe("network error handling (online but network fails)", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
    });

    it("should allow navigation when network error occurs", async () => {
      // Mock network error
      vi.mocked(authClientModule.authClient.getSession).mockRejectedValue(
        new Error("Failed to fetch"),
      );

      // Network errors should allow navigation (session is cached)
      const result = await routeModule.Route.options.beforeLoad?.({});

      expect(result).toBeUndefined();
    });
  });

  describe("HTTP error handling (online with server response)", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
    });

    it("should allow navigation on network errors", async () => {
      vi.mocked(authClientModule.authClient.getSession).mockRejectedValue(
        new Error("Network error"),
      );

      // Network errors should allow navigation (session is cached)
      const result = await routeModule.Route.options.beforeLoad?.({});

      expect(result).toBeUndefined();
    });

    it("should redirect on authentication errors", async () => {
      vi.mocked(authClientModule.authClient.getSession).mockRejectedValue(
        new Error("Unauthorized"),
      );

      // Auth errors should redirect to login
      await expect(routeModule.Route.options.beforeLoad?.({})).rejects.toThrow(
        "redirect:/",
      );
    });
  });

  describe("successful authentication", () => {
    it("should allow navigation when session is valid", async () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      vi.mocked(authClientModule.authClient.getSession).mockResolvedValue({
        data: { user: { id: "1", email: "test@example.com" } },
      } as any);

      const result = await routeModule.Route.options.beforeLoad?.({});

      expect(result).toBeUndefined();
    });

    it("should redirect when session is null", async () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      vi.mocked(authClientModule.authClient.getSession).mockResolvedValue(null);

      await expect(routeModule.Route.options.beforeLoad?.({})).rejects.toThrow(
        "redirect:/",
      );
    });
  });
});
