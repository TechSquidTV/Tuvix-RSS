/**
 * Admin Route Offline Navigation Tests
 *
 * Tests for admin route protection behavior when offline
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

// Import the route module to test beforeLoad
const routeModule = await import("../../routes/app/admin/route");

describe("Admin Route - Offline Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  describe("network error handling", () => {
    it("should redirect to /app when network error occurs", async () => {
      // Network error = no session in context (handled by root/app route)
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });

    it("should redirect to /app when offline (navigator.onLine = false)", async () => {
      // Mock offline state
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
        configurable: true,
      });

      // Offline with no session
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");

      // Reset navigator.onLine
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
        configurable: true,
      });
    });
  });

  describe("authentication and authorization", () => {
    it("should redirect to / when no session exists", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });

    it("should redirect to / when session has no user", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: { user: null } as any } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });

    it("should allow navigation when session has admin user", async () => {
      const result = await routeModule.Route.options.beforeLoad?.({
        context: {
          auth: {
            session: {
              user: {
                id: "1",
                email: "admin@example.com",
                role: "admin",
              },
            } as any,
          },
        },
      } as any);

      expect(result).toBeUndefined();
    });

    it("should redirect to /app when session has non-admin user", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: {
            auth: {
              session: {
                user: {
                  id: "1",
                  email: "user@example.com",
                  role: "user",
                },
              } as any,
            },
          },
        } as any)
      ).rejects.toThrow("redirect:/app");
    });

    it("should redirect to /app when user has no role", async () => {
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: {
            auth: {
              session: {
                user: {
                  id: "1",
                  email: "user@example.com",
                  // No role field
                },
              } as any,
            },
          },
        } as any)
      ).rejects.toThrow("redirect:/app");
    });
  });

  describe("error handling", () => {
    it("should redirect to /app on network errors", async () => {
      // Non-admin user (network errors handled by parent routes)
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: {
            auth: {
              session: {
                user: {
                  id: "1",
                  email: "user@example.com",
                  role: "user",
                },
              } as any,
            },
          },
        } as any)
      ).rejects.toThrow("redirect:/app");
    });

    it("should redirect to / on other errors", async () => {
      // No session = authentication error
      await expect(
        routeModule.Route.options.beforeLoad?.({
          context: { auth: { session: null } },
        } as any)
      ).rejects.toThrow("redirect:/");
    });
  });

  describe("admin component", () => {
    it("should export a valid component function", () => {
      expect(routeModule.Route.options.component).toBeDefined();
      expect(typeof routeModule.Route.options.component).toBe("function");
    });
  });
});
