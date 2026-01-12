/**
 * App Route Offline Navigation Tests
 *
 * Tests for route protection behavior when offline
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");

  // Create a special redirect error class that can be identified
  class RedirectError extends Error {
    to: string;
    constructor(to: string) {
      super(`redirect:${to}`);
      this.name = "RedirectError";
      this.to = to;
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
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }

    // Reset mocks
    mockCheckVerificationStatus.mockResolvedValue({
      requiresVerification: false,
      emailVerified: true,
    });
  });

  describe("session validation", () => {
    it("should redirect when no session exists", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });

    it("should redirect when session has no user", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: { user: null } as any } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });
  });

  describe("offline navigation (navigator.onLine = false)", () => {
    it("should allow navigation with valid session when offline", async () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const result = await routeModule.Route.options.beforeLoad?.({
        context: {
          auth: {
            session: {
              user: { id: "1", email: "test@example.com" },
            } as any,
          },
        },
      } as any);

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
      // Mock verification check failure
      mockCheckVerificationStatus.mockRejectedValue(
        new Error("Failed to fetch")
      );

      // Network errors should allow navigation (session is cached)
      const result = await routeModule.Route.options.beforeLoad?.({
        context: {
          auth: {
            session: {
              user: { id: "1", email: "test@example.com" },
            } as any,
          },
        },
      } as any);

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
      // Mock verification check failure
      mockCheckVerificationStatus.mockRejectedValue(new Error("Network error"));

      // Network errors should allow navigation (session is cached)
      const result = await routeModule.Route.options.beforeLoad?.({
        context: {
          auth: {
            session: {
              user: { id: "1", email: "test@example.com" },
            } as any,
          },
        },
      } as any);

      expect(result).toBeUndefined();
    });

    it("should redirect on authentication errors", async () => {
      // No session = authentication error
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });
  });

  describe("successful authentication", () => {
    it("should allow navigation when session is valid", async () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      const result = await routeModule.Route.options.beforeLoad?.({
        context: {
          auth: {
            session: {
              user: { id: "1", email: "test@example.com" },
            } as any,
          },
        },
      } as any);

      expect(result).toBeUndefined();
    });

    it("should redirect when session is null", async () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });
  });

  describe("AppLayout component", () => {
    it("should export the component function", () => {
      // Verify the route has a component defined
      expect(routeModule.Route.options.component).toBeDefined();
      expect(typeof routeModule.Route.options.component).toBe("function");
    });
  });
});
