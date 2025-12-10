/**
 * Integration test for batch query input handling
 *
 * Tests the fix for TUVIX-API-14: "expected object, received undefined"
 * when tRPC sends batch GET requests with undefined input.
 *
 * @see https://github.com/honojs/middleware/issues
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
} from "@/test/setup";
import { appRouter } from "@/trpc/router";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Batch Query Input Handling (TUVIX-API-14)", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let testSource: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    testSource = await seedTestSource(db, {
      url: "https://example.com/feed.xml",
      title: "Test Feed",
    });

    await seedTestSubscription(db, testUser.id, testSource.id);
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return appRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {},
      req: {} as any,
      cache: {},
    });
  }

  it("should handle undefined input in subscriptions.list", async () => {
    const caller = createCaller();

    // Simulate what happens when tRPC sends a batch GET request
    // where the input is undefined (empty object in query string)
    const result = await caller.subscriptions.list(undefined as any);

    expect(result).toBeDefined();
    expect(result.items).toBeInstanceOf(Array);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  it("should handle undefined input in articles.getCounts", async () => {
    const caller = createCaller();

    // Simulate undefined input from batch GET request
    const result = await caller.articles.getCounts(undefined as any);

    expect(result).toBeDefined();
    expect(typeof result.all).toBe("number");
    expect(typeof result.unread).toBe("number");
    expect(typeof result.read).toBe("number");
    expect(typeof result.saved).toBe("number");
  });

  it("should handle undefined input in articles.list", async () => {
    const caller = createCaller();

    // Simulate undefined input from batch GET request
    const result = await caller.articles.list(undefined as any);

    expect(result).toBeDefined();
    expect(result.items).toBeInstanceOf(Array);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  it("should handle batch request with mixed undefined and defined inputs", async () => {
    const caller = createCaller();

    // Simulate batch request where some procedures get undefined input
    const [listResult, countsResult, detailedListResult] = await Promise.all([
      caller.subscriptions.list(undefined as any), // undefined input
      caller.articles.getCounts(undefined as any), // undefined input
      caller.articles.list({
        // defined input with filters
        limit: 10,
        offset: 0,
        read: false,
      }),
    ]);

    // All should succeed without validation errors
    expect(listResult.items).toHaveLength(1);
    expect(countsResult.all).toBeGreaterThanOrEqual(0);
    expect(detailedListResult.items).toBeInstanceOf(Array);
  });

  it("should apply default values when input is undefined", async () => {
    const caller = createCaller();

    // When input is undefined, defaults should be applied
    const result = await caller.subscriptions.list(undefined as any);

    // The withUndefinedAsEmpty helper converts undefined -> {}
    // Then paginationInputSchema applies defaults: limit=50, offset=0
    expect(result).toBeDefined();

    // We can't directly inspect the input that was used, but we can verify
    // the result is valid and follows pagination behavior
    expect(result.items.length).toBeLessThanOrEqual(50); // default limit
  });

  it("should preserve explicit input values over defaults", async () => {
    const caller = createCaller();

    // Explicit values should override defaults
    const result = await caller.subscriptions.list({
      limit: 5,
      offset: 0,
    });

    expect(result).toBeDefined();
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it("should handle admin endpoints with undefined input", async () => {
    // Make the test user an admin
    await db
      .update(schema.user)
      .set({ role: "admin" })
      .where(eq(schema.user.id, testUser.id));

    // Create caller with admin role
    const adminCaller = appRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "admin" },
      env: {} as any,
      headers: {},
      req: {} as any,
      cache: {},
    });

    // Simulate undefined input in admin.listUsers
    const result = await adminCaller.admin.listUsers(undefined as any);

    expect(result).toBeDefined();
    expect(result.items).toBeInstanceOf(Array);
  });
});
