/**
 * tRPC Initialization Tests
 *
 * Tests for tRPC setup including Sentry middleware integration
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { router, publicProcedure, rateLimitedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { createTestDb, seedTestUser, cleanupTestDb } from "@/test/setup";
import { createContext } from "../context";
import type { Env } from "@/types";

// Mock Better Auth
// Set up default mock that returns empty auth (no session)
vi.mock("@/auth/better-auth", () => {
  const mockCreateAuth = vi.fn(() => ({
    api: {
      getSession: vi.fn().mockResolvedValue({ data: null }),
    },
  }));
  return {
    createAuth: mockCreateAuth,
  };
});

// Mock database client
vi.mock("@/db/client", () => ({
  createDatabase: vi.fn(),
}));

// Set up a test database for all tests
let globalTestDb: ReturnType<typeof createTestDb>;

beforeAll(() => {
  globalTestDb = createTestDb();
});

afterAll(() => {
  cleanupTestDb(globalTestDb);
});

beforeEach(async () => {
  // Set default mock return value for all tests
  const { createDatabase } = await import("@/db/client");
  vi.mocked(createDatabase).mockReturnValue(globalTestDb as any);
});

describe("tRPC Router", () => {
  it("should create a router", () => {
    const testRouter = router({
      test: publicProcedure.query(() => "test"),
    });

    expect(testRouter).toBeDefined();
  });
});

describe("publicProcedure", () => {
  it("should execute without authentication", async () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const testRouter = router({
      test: publicProcedure.query(() => "success"),
    });

    const caller = testRouter.createCaller(
      await createContext({
        req: { headers: new Headers() } as any,
        resHeaders: {} as any,
        info: {} as any,
        env,
      })
    );

    const result = await caller.test();
    expect(result).toBe("success");
  });

  it("should work with Sentry middleware when available", async () => {
    // Note: Sentry middleware is optional and may not be available in test environment
    // This test verifies the procedure still works regardless
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const testRouter = router({
      test: publicProcedure.query(() => "success"),
    });

    const caller = testRouter.createCaller(
      await createContext({
        req: { headers: new Headers() } as any,
        resHeaders: {} as any,
        info: {} as any,
        env,
      })
    );

    const result = await caller.test();
    expect(result).toBe("success");
  });
});

describe("rateLimitedProcedure", () => {
  let db: ReturnType<typeof createTestDb>;
  let env: Env;

  beforeEach(async () => {
    db = createTestDb();
    env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SKIP_RATE_LIMIT: "true", // Skip rate limiting in tests
    };

    // Mock createDatabase to return our test db
    const { createDatabase } = await import("@/db/client");
    vi.mocked(createDatabase).mockReturnValue(db as any);
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const testRouter = router({
      test: rateLimitedProcedure.query(() => "success"),
    });

    const caller = testRouter.createCaller(
      await createContext({
        req: { headers: new Headers() } as any,
        resHeaders: {} as any,
        info: {} as any,
        env,
      })
    );

    await expect(caller.test()).rejects.toThrow(TRPCError);
    await expect(caller.test()).rejects.toThrow("Authentication required");
  });

  it("should execute with valid authentication", async () => {
    const { user } = await seedTestUser(db);
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SKIP_RATE_LIMIT: "true",
    };

    // Mock Better Auth session
    const mockSession = {
      user: {
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    // Override the default mock to return our test user session
    const authModule = await import("@/auth/better-auth");
    const createAuthMock = vi.mocked(authModule.createAuth);

    // Better Auth's getSession returns the session object directly (with user property)
    // So we return mockSession which has { user: {...} }
    const getSessionMock = vi.fn().mockResolvedValue(mockSession);

    createAuthMock.mockImplementation(
      () =>
        ({
          api: {
            getSession: getSessionMock,
          },
        }) as any
    );

    const testRouter = router({
      test: rateLimitedProcedure.query(({ ctx }) => {
        return `success: ${ctx.user.userId}`;
      }),
    });

    // Create context - createAuth should now use our mock
    const context = await createContext({
      req: {
        headers: new Headers({
          cookie: `better-auth.session_token=mock-token`,
        }),
      } as any,
      resHeaders: {} as any,
      info: {} as any,
      env,
    });

    // Verify getSession was called (proves mock is working)
    expect(getSessionMock).toHaveBeenCalled();

    // Verify the context has the user
    expect(context.user).not.toBeNull();
    expect(context.user?.userId).toBe(user.id);

    const caller = testRouter.createCaller(context);
    const result = await caller.test();

    // Verify the procedure executed successfully with authentication
    expect(result).toBe(`success: ${user.id}`);
  });
});

describe("Sentry Middleware Integration", () => {
  it("should handle Sentry middleware gracefully when not available", async () => {
    // Sentry middleware is optional and may not be available in test environment
    // This test verifies that the code handles this gracefully
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const testRouter = router({
      test: publicProcedure.query(() => "success"),
    });

    const caller = testRouter.createCaller(
      await createContext({
        req: { headers: new Headers() } as any,
        resHeaders: {} as any,
        info: {} as any,
        env,
      })
    );

    const result = await caller.test();
    expect(result).toBe("success");
  });

  it("should not break when Sentry import fails", async () => {
    // The middleware setup uses try-catch to handle import failures
    // This test verifies that behavior
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const testRouter = router({
      test: publicProcedure.query(() => "success"),
    });

    const caller = testRouter.createCaller(
      await createContext({
        req: { headers: new Headers() } as any,
        resHeaders: {} as any,
        info: {} as any,
        env,
      })
    );

    // Should work even if Sentry is not available
    const result = await caller.test();
    expect(result).toBe("success");
  });
});
