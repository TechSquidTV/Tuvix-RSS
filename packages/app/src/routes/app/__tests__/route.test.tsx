import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the redirect function from @tanstack/react-router
vi.mock("@tanstack/react-router", () => ({
  redirect: vi.fn((...args) => {
    // Simulate redirect by throwing, as TanStack Router does
    throw new Error("Redirected");
  }),
}));

describe("App Route beforeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
  });

  it("redirects when no session.user exists", async () => {
    const mockContext = {
      auth: {
        session: null,
      },
    };

    // Import the Route to get the beforeLoad function
    const { Route } = await import("../route");

    // Expect the beforeLoad to throw a redirect
    await expect(
      Route.options.beforeLoad({ context: mockContext } as any),
    ).rejects.toThrow();
  });

  it("redirects when session exists but no user", async () => {
    const mockContext = {
      auth: {
        session: {}, // Session exists but no user property
      },
    };

    const { Route } = await import("../route");

    await expect(
      Route.options.beforeLoad({ context: mockContext } as any),
    ).rejects.toThrow();
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

    const { Route } = await import("../route");

    // Should not throw when offline with valid session
    const result = await Route.options.beforeLoad({
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

    const mockTRPCQuery = vi.fn().mockResolvedValue({
      requiresVerification: false,
      emailVerified: true,
    });

    // Mock the tRPC client creation
    vi.doMock("@trpc/client", () => ({
      createTRPCClient: vi.fn(() => ({
        auth: {
          checkVerificationStatus: {
            query: mockTRPCQuery,
          },
        },
      })),
      httpBatchLink: vi.fn(() => ({})),
    }));

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

    const { Route } = await import("../route");

    // Should complete without throwing
    const result = await Route.options.beforeLoad({
      context: mockContext,
    } as any);

    // Result is undefined on success (no redirect)
    expect(result).toBeUndefined();
  });
});
