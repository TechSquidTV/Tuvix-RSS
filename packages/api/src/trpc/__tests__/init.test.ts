/**
 * tRPC Initialization Tests
 *
 * Tests for tRPC setup including Sentry middleware integration
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
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

/**
 * Create a mock Hono context for testing
 * The createContext function now expects a Hono context with .get() and .req.raw
 */
function createMockHonoContext(env: Env, headers: Headers = new Headers()) {
  return {
    get: (key: string) => {
      if (key === "env") return env;
      return undefined;
    },
    req: {
      raw: {
        headers,
      } as Request,
    },
  } as any;
}

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
    } as Env;

    const testRouter = router({
      test: publicProcedure.query(() => "success"),
    });

    const mockContext = createMockHonoContext(env);
    const caller = testRouter.createCaller(await createContext(mockContext));

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
    } as Env;

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

    const mockContext = createMockHonoContext(env);
    const caller = testRouter.createCaller(await createContext(mockContext));

    await expect(caller.test()).rejects.toThrow(TRPCError);
    await expect(caller.test()).rejects.toThrow("Authentication required");
  });

  it("should execute with valid authentication", async () => {
    const { user } = await seedTestUser(db);
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SKIP_RATE_LIMIT: "true",
    } as Env;

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

    // Create context with mock Hono context
    const headers = new Headers({
      cookie: `better-auth.session_token=mock-token`,
    });
    const mockHonoContext = createMockHonoContext(env, headers);
    const context = await createContext(mockHonoContext);

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
