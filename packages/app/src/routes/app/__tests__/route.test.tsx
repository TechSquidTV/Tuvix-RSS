import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the redirect function from @tanstack/react-router
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
      admin: {
        getGlobalSettings: {
          query: vi.fn().mockResolvedValue({
            adminBypassEmailVerification: true,
          }),
        },
      },
    })),
    httpBatchLink: vi.fn(() => () => {}),
  };
});

// Import the route module after mocks are set up
const routeModule = await import("../route");

describe("App Route beforeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset navigator.onLine to true by default
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    // Reset the mock
    mockCheckVerificationStatus.mockResolvedValue({
      requiresVerification: false,
      emailVerified: true,
    });
  });

  it("redirects when no session.user exists", async () => {
    const mockContext = {
      auth: {
        session: null,
      },
    };

    // Expect the beforeLoad to throw a redirect
    await expect(
      routeModule.Route.options.beforeLoad({ context: mockContext } as any)
    ).rejects.toThrow("redirect:/");
  });

  it("redirects when session exists but no user", async () => {
    const mockContext = {
      auth: {
        session: {}, // Session exists but no user property
      },
    };

    await expect(
      routeModule.Route.options.beforeLoad({ context: mockContext } as any)
    ).rejects.toThrow("redirect:/");
  });

  it("returns early when offline and session exists", async () => {
    // Set offline
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    const mockContext = {
      auth: {
        session: {
          user: {
            id: 1,
            email: "test@example.com",
          },
        },
      },
    };

    // Should not throw when offline with valid session
    const result = await routeModule.Route.options.beforeLoad({
      context: mockContext,
    } as any);

    // When offline, it returns early (undefined)
    expect(result).toBeUndefined();
  });

  it("continues when online with valid session", async () => {
    // Set online
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    const mockContext = {
      auth: {
        session: {
          user: {
            id: 1,
            email: "test@example.com",
            role: "user",
          },
        },
      },
    };

    // Should complete without throwing
    const result = await routeModule.Route.options.beforeLoad({
      context: mockContext,
    } as any);

    // Result is undefined on success (no redirect)
    expect(result).toBeUndefined();
  });
});
