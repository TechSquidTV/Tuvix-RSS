/**
 * HTTP Integration Tests
 *
 * Tests tRPC endpoints through the full HTTP stack (Hono + @hono/trpc-server)
 * to catch path parsing and routing issues that unit tests miss.
 *
 * These tests complement the unit tests which use direct caller invocation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
} from "@/test/setup";
import { createHonoApp } from "@/hono/app";
import type { Env } from "@/types";
import * as SentryNode from "@sentry/node";

describe("HTTP Integration - tRPC Batch Requests", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof createHonoApp>;
  let testUser: { id: number };
  let authCookie: string;

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    // Create Hono app with test environment
    const env: Env = {
      DB: {} as any,
      NODE_ENV: "test",
      SKIP_RATE_LIMIT: "true",
      AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
      AUTH_URL: "http://localhost:3001",
      APP_URL: "http://localhost:5173",
    };

    app = createHonoApp({
      env,
      sentry: SentryNode as any,
      runtime: "nodejs",
    });

    // Mock authentication by getting a session token
    // In a real test, you'd call the auth endpoint, but for now we'll simulate
    authCookie = "test-session-cookie"; // Simplified for example
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  it("should handle batch GET request without path truncation", async () => {
    // Simulate a tRPC batch request like the client sends
    const url =
      "/trpc/categories.list,subscriptions.list,articles.getCounts?batch=1&input={}";

    const res = await app.request(url, {
      method: "GET",
      headers: {
        Cookie: authCookie,
      },
    });

    expect(res.status).toBe(207); // Multi-status for batch

    const data = await res.json();
    expect(data).toBeInstanceOf(Array);
    expect(data).toHaveLength(3);

    // Check that procedures were found (not path truncation errors)
    // If path parsing fails, we'd see errors like:
    // "No procedure found on path 's.list'" (categories.list → s.list)
    // "No procedure found on path 'ions.list'" (subscriptions.list → ions.list)

    // Instead, we should see either successful results or auth errors
    for (const item of data) {
      if (item.error) {
        // Auth errors are expected if we're not properly authenticated
        expect(item.error.json.data.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
        // Make sure it's NOT a path parsing error
        expect(item.error.json.message).not.toMatch(
          /No procedure found on path/
        );
      } else {
        // If auth works, check for valid data structure
        expect(item.result).toBeDefined();
      }
    }
  });

  it("should parse procedure paths correctly in single requests", async () => {
    const testCases = [
      "/trpc/categories.list?batch=1&input={}",
      "/trpc/subscriptions.list?batch=1&input={}",
      "/trpc/articles.getCounts?batch=1&input={}",
      "/trpc/userSettings.get?batch=1&input={}",
      "/trpc/plans.list?batch=1&input={}",
    ];

    for (const url of testCases) {
      const res = await app.request(url, {
        method: "GET",
        headers: {
          Cookie: authCookie,
        },
      });

      const data = await res.json();

      // Check that the path was parsed correctly
      // If path parsing failed, we'd see "No procedure found on path" errors
      if (Array.isArray(data) && data[0]?.error) {
        const errorMsg = data[0].error.json.message;
        expect(errorMsg).not.toMatch(/No procedure found on path/);
        // Should be auth errors instead
        expect(data[0].error.json.data.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
      }
    }
  });

  it("should handle auth.checkVerificationStatus without truncation", async () => {
    // This was reported as "kVerificationStatus" in production
    const res = await app.request(
      "/trpc/auth.checkVerificationStatus?batch=1&input={}",
      {
        method: "GET",
        headers: {
          Cookie: authCookie,
        },
      }
    );

    const data = await res.json();

    if (Array.isArray(data) && data[0]?.error) {
      // Should NOT be a path parsing error
      expect(data[0].error.json.message).not.toBe(
        'No procedure found on path "kVerificationStatus"'
      );
    }
  });

  it("should handle multi-procedure batch with complex input", async () => {
    // Real-world batch request with mixed inputs
    const input = encodeURIComponent(
      JSON.stringify({
        0: { limit: 100, offset: 0 },
        1: {},
        2: { limit: 50, direction: "forward" },
      })
    );

    const url = `/trpc/subscriptions.list,categories.list,articles.list?batch=1&input=${input}`;

    const res = await app.request(url, {
      method: "GET",
      headers: {
        Cookie: authCookie,
      },
    });

    expect(res.status).toBe(207);

    const data = await res.json();
    expect(data).toBeInstanceOf(Array);
    expect(data).toHaveLength(3);

    // Verify no path truncation errors
    for (const item of data) {
      if (item.error) {
        expect(item.error.json.message).not.toMatch(
          /No procedure found on path/
        );
      }
    }
  });

  it("should return proper 404 for non-existent procedures", async () => {
    const res = await app.request(
      "/trpc/nonexistent.procedure?batch=1&input={}",
      {
        method: "GET",
      }
    );

    const data = await res.json();

    // Should get a proper 404 for non-existent procedure
    expect(data[0]?.error.json.message).toMatch(/No procedure found/);
    expect(data[0]?.error.json.data.code).toBe("NOT_FOUND");
  });
});

describe("HTTP Integration - Health Check", () => {
  it("should respond to health check", async () => {
    const env: Env = {
      DB: {} as any,
      NODE_ENV: "test",
    };

    const app = createHonoApp({
      env,
      sentry: SentryNode as any,
      runtime: "nodejs",
    });

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.runtime).toBe("nodejs");
  });
});
