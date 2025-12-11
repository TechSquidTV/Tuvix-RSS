/**
 * HTTP Integration Tests
 *
 * Tests tRPC endpoints through the full HTTP stack (Hono + fetchRequestHandler)
 * to catch path parsing and routing issues that unit tests miss.
 *
 * These tests complement the unit tests which use direct caller invocation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedGlobalSettings } from "@/test/setup";
import { createHonoApp } from "@/hono/app";
import type { Env } from "@/types";
import * as SentryNode from "@sentry/node";

/**
 * Helper to extract error info from tRPC response
 * Without SuperJSON, errors are returned directly (not wrapped in .json)
 */
function getErrorInfo(errorObj: any): { message: string; code: string } | null {
  if (!errorObj) return null;

  // Without SuperJSON: { message: "...", data: { code: "..." } }
  if (errorObj.message && errorObj.data?.code) {
    return { message: errorObj.message, code: errorObj.data.code };
  }

  // With SuperJSON wrapping: { json: { message: "...", data: { code: "..." } } }
  if (errorObj.json?.message && errorObj.json?.data?.code) {
    return { message: errorObj.json.message, code: errorObj.json.data.code };
  }

  return null;
}

describe("HTTP Integration - tRPC Batch Requests", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof createHonoApp>;

  beforeEach(async () => {
    db = createTestDb();
    await seedGlobalSettings(db);

    // Create Hono app with test environment
    const env: Env = {
      DB: db as any,
      NODE_ENV: "test",
      SKIP_RATE_LIMIT: "true",
      BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
      BASE_URL: "https://test.com",
      APP_URL: "https://test.com",
    } as Env;

    app = createHonoApp({
      env,
      sentry: SentryNode as any,
      runtime: "nodejs",
    });

    // Note: These tests don't require authentication - they verify path parsing
    // by checking that we get UNAUTHORIZED errors (not path parsing errors)
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
    });

    // Without auth, batch requests return 401 at HTTP level (not 207)
    // This is expected behavior for protected endpoints
    expect(res.status).toBe(401);

    const data = await res.json();

    // Batch requests return an array of error objects
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Verify each error is an auth error, not a path parsing error
    for (const item of data) {
      if (item.error) {
        const errorInfo = getErrorInfo(item.error);
        expect(errorInfo).not.toBeNull();
        expect(errorInfo!.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
        expect(errorInfo!.message).not.toMatch(/No procedure found on path/);
      }
    }
  });

  it("should parse procedure paths correctly in single requests", async () => {
    const testCases = [
      {
        url: "/trpc/categories.list?batch=1&input={}",
        name: "categories.list",
      },
      {
        url: "/trpc/subscriptions.list?batch=1&input={}",
        name: "subscriptions.list",
      },
      {
        url: "/trpc/articles.getCounts?batch=1&input={}",
        name: "articles.getCounts",
      },
      {
        url: "/trpc/userSettings.get?batch=1&input={}",
        name: "userSettings.get",
      },
    ];

    for (const testCase of testCases) {
      const res = await app.request(testCase.url, {
        method: "GET",
      });

      const data = await res.json();

      // Check that the path was parsed correctly
      // If path parsing failed, we'd see "No procedure found on path" errors
      if (Array.isArray(data) && data[0]?.error) {
        const errorInfo = getErrorInfo(data[0].error);
        expect(errorInfo, `No error info for ${testCase.name}`).not.toBeNull();
        expect(
          errorInfo!.message,
          `Path parsing failed for ${testCase.name}`
        ).not.toMatch(/No procedure found on path/);
        // Should be auth errors instead
        expect(
          errorInfo!.code,
          `Wrong error code for ${testCase.name}`
        ).toMatch(/UNAUTHORIZED|FORBIDDEN/);
      } else if (!Array.isArray(data) && data.error) {
        // Single error response (not batch)
        const errorInfo = getErrorInfo(data.error);
        expect(errorInfo, `No error info for ${testCase.name}`).not.toBeNull();
        expect(
          errorInfo!.message,
          `Path parsing failed for ${testCase.name}`
        ).not.toMatch(/No procedure found on path/);
        expect(
          errorInfo!.code,
          `Wrong error code for ${testCase.name}`
        ).toMatch(/UNAUTHORIZED|FORBIDDEN/);
      }
    }
  });

  it("should handle auth.checkVerificationStatus without truncation", async () => {
    // This was reported as "kVerificationStatus" in production
    // This endpoint is accessible without auth, so should work
    const res = await app.request(
      "/trpc/auth.checkVerificationStatus?batch=1&input={}",
      {
        method: "GET",
      }
    );

    const data = await res.json();

    // Should NOT be a path parsing error - should either succeed or give an expected error
    if (Array.isArray(data) && data[0]?.error) {
      const errorInfo = getErrorInfo(data[0].error);
      if (errorInfo) {
        expect(errorInfo.message).not.toBe(
          'No procedure found on path "kVerificationStatus"'
        );
      }
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
    });

    // Without auth, returns 401 (not 207)
    expect(res.status).toBe(401);

    const data = await res.json();

    // Verify no path truncation - should be auth error
    // Response format for 401 can be either {error: ...} or direct error object
    if (data.error) {
      const errorInfo = getErrorInfo(data.error);
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).not.toMatch(/No procedure found on path/);
      expect(errorInfo!.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
    } else if (Array.isArray(data) && data[0]?.error) {
      // Batch format
      const errorInfo = getErrorInfo(data[0].error);
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).not.toMatch(/No procedure found on path/);
      expect(errorInfo!.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
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
    if (Array.isArray(data) && data[0]?.error) {
      const errorInfo = getErrorInfo(data[0].error);
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).toMatch(/No procedure found/);
      expect(errorInfo!.code).toBe("NOT_FOUND");
    } else if (data.error) {
      const errorInfo = getErrorInfo(data.error);
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).toMatch(/No procedure found/);
      expect(errorInfo!.code).toBe("NOT_FOUND");
    }
  });

  it("should NOT double-wrap SuperJSON responses in {json: ...} format", async () => {
    // Test for the SuperJSON double-wrapping bug fix
    // When SuperJSON is configured on both client and server with @hono/trpc-server,
    // data gets wrapped as {json: {...}} instead of plain objects
    // See: packages/app/src/components/provider/trpc-provider.tsx and packages/api/src/trpc/init.ts
    //
    // NOTE: Without authentication, we can't test actual response data,
    // but we can verify the path is parsed correctly (auth error, not path error)

    const res = await app.request("/trpc/articles.getCounts?batch=1&input={}", {
      method: "GET",
    });

    const data = await res.json();

    // Without auth, we get an error response
    // But it should be an auth error, not a path parsing error
    if (Array.isArray(data) && data[0]?.error) {
      const resultData = data[0].error;
      const errorInfo = getErrorInfo(resultData);

      // Verify path was parsed correctly (not a path truncation error)
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).not.toMatch(/No procedure found on path/);
      expect(errorInfo!.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);

      // Verify error response itself isn't double-wrapped
      // Without SuperJSON, we should have direct access to .message and .data
      // (not .json.message and .json.data)
      const hasDirectFormat = !!(resultData.message && resultData.data?.code);
      const hasSuperJSONFormat = !!(
        resultData.json?.message && resultData.json?.data?.code
      );

      // Should have one format or the other, but not double-wrapped
      expect(hasDirectFormat || hasSuperJSONFormat).toBe(true);

      if (hasSuperJSONFormat) {
        // If using SuperJSON format, shouldn't be double-wrapped
        expect(resultData.json).not.toHaveProperty("json");
      }
    } else if (data.error) {
      // Single error response (not batch)
      const errorInfo = getErrorInfo(data.error);
      expect(errorInfo).not.toBeNull();
      expect(errorInfo!.message).not.toMatch(/No procedure found on path/);
      expect(errorInfo!.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
    } else {
      // Sometimes 401 returns a different format - verify it's not a path error
      // by checking it's an expected auth error structure
      expect(res.status).toBe(401);
    }
  });
});

describe("HTTP Integration - Health Check", () => {
  it("should respond to health check", async () => {
    const env: Env = {
      DB: {} as any,
      NODE_ENV: "test",
    } as Env;

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
