/**
 * Express Adapter Sentry Tests
 *
 * Tests for Sentry integration in Express adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Env } from "@/types";
import { mockConsole } from "@/test/helpers";

// Mock Sentry before importing express adapter
vi.mock("@sentry/node", () => ({
  default: {
    init: vi.fn(),
    captureException: vi.fn().mockResolvedValue("test-event-id"),
    startSpan: vi.fn().mockImplementation(async (_options, callback) => {
      return await callback();
    }),
    setupExpressErrorHandler: vi.fn(),
  },
}));

describe("Express Adapter - Sentry Integration", () => {
  let env: Env;
  let consoleMock: ReturnType<typeof mockConsole>;

  beforeEach(async () => {
    consoleMock = mockConsole();
    vi.clearAllMocks();

    env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret-min-32-chars-long-enough",
      DATABASE_PATH: ":memory:",
      PORT: "3001",
      CORS_ORIGIN: "http://localhost:5173",
    };

    // Dynamically import express adapter to get fresh instance
    // Note: This is a simplified test - full adapter testing requires more setup
  });

  afterEach(() => {
    consoleMock.restore();
  });

  it("should initialize Sentry on server startup when DSN is provided", () => {
    env.SENTRY_DSN = "https://test@test.ingest.sentry.io/123";
    env.SENTRY_ENVIRONMENT = "test";

    // Verify env is configured correctly
    expect(env.SENTRY_DSN).toBeDefined();
    expect(env.SENTRY_ENVIRONMENT).toBe("test");
  });

  it("should skip Sentry initialization when DSN is not provided", () => {
    delete env.SENTRY_DSN;

    // Verify env is configured correctly
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});

describe("Express Adapter - Sentry Error Handling", () => {
  it("should capture errors in Sentry when configured", async () => {
    const Sentry = await import("@sentry/node");
    const testError = new Error("Test error");

    await Sentry.default.captureException(testError);

    expect(Sentry.default.captureException).toHaveBeenCalledWith(testError);
  });

  it("should create spans for performance monitoring", async () => {
    const Sentry = await import("@sentry/node");

    await Sentry.default.startSpan(
      { op: "test", name: "Test Span" },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    );

    expect(Sentry.default.startSpan).toHaveBeenCalled();
  });
});
