/**
 * Cron Executor Tests
 *
 * Tests for the shared cron execution logic used by both
 * Cloudflare Workers and Node.js runtimes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeScheduledTasks } from "../executor";
import { createTestDb, cleanupTestDb } from "@/test/setup";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "@/types";

// Mock handlers
vi.mock("../handlers", () => ({
  handleRSSFetch: vi.fn().mockResolvedValue(undefined),
  handleArticlePrune: vi.fn().mockResolvedValue({ deletedCount: 5 }),
  handleTokenCleanup: vi.fn().mockResolvedValue({ deletedCount: 3 }),
}));

// Mock metrics
vi.mock("@/utils/metrics", () => ({
  emitCounter: vi.fn(),
}));

describe("Cron Executor", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let env: Env;

  beforeEach(async () => {
    db = createTestDb();
    env = {
      BETTER_AUTH_SECRET: "test-secret",
      RUNTIME: "nodejs",
    } as Env;

    // Reset mocks
    vi.clearAllMocks();

    // Delete any existing global settings
    await db
      .delete(schema.globalSettings)
      .where(eq(schema.globalSettings.id, 1));

    // Seed global settings with null timestamps (first run)
    await db.insert(schema.globalSettings).values({
      id: 1,
      maxLoginAttempts: 5,
      loginAttemptWindowMinutes: 15,
      lockoutDurationMinutes: 30,
      allowRegistration: true,
      requireEmailVerification: false,
      adminBypassEmailVerification: true,
      passwordResetTokenExpiryHours: 1,
      fetchIntervalMinutes: 60,
      pruneDays: 30,
      lastRssFetchAt: null,
      lastPruneAt: null,
      lastTokenCleanupAt: null,
      updatedAt: new Date(),
      updatedBy: null,
    });
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.clearAllMocks();
  });

  describe("executeScheduledTasks", () => {
    it("should execute all tasks on first run (null timestamps)", async () => {
      const { handleRSSFetch, handleArticlePrune, handleTokenCleanup } =
        await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleRSSFetch).toHaveBeenCalledWith(env);
      expect(handleArticlePrune).toHaveBeenCalledWith(env);
      expect(handleTokenCleanup).toHaveBeenCalledWith(env);

      expect(result.rssFetch.executed).toBe(true);
      expect(result.articlePrune.executed).toBe(true);
      expect(result.articlePrune.deletedCount).toBe(5);
      expect(result.tokenCleanup.executed).toBe(true);
      expect(result.tokenCleanup.deletedCount).toBe(3);
    });

    it("should skip RSS fetch when interval not elapsed", async () => {
      // Set lastRssFetchAt to recent time (5 minutes ago)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastRssFetchAt: fiveMinutesAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleRSSFetch } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleRSSFetch).not.toHaveBeenCalled();
      expect(result.rssFetch.executed).toBe(false);
      expect(result.rssFetch.skippedReason).toContain("minutes ago");
    });

    it("should execute RSS fetch when interval elapsed", async () => {
      // Set lastRssFetchAt to 2 hours ago (exceeds 60 min default)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastRssFetchAt: twoHoursAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleRSSFetch } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleRSSFetch).toHaveBeenCalledWith(env);
      expect(result.rssFetch.executed).toBe(true);
    });

    it("should skip article prune when 24 hours not elapsed", async () => {
      // Set lastPruneAt to 12 hours ago
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastPruneAt: twelveHoursAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleArticlePrune } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleArticlePrune).not.toHaveBeenCalled();
      expect(result.articlePrune.executed).toBe(false);
      expect(result.articlePrune.skippedReason).toContain("hours ago");
    });

    it("should execute article prune when 24 hours elapsed", async () => {
      // Set lastPruneAt to 25 hours ago
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastPruneAt: twentyFiveHoursAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleArticlePrune } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleArticlePrune).toHaveBeenCalledWith(env);
      expect(result.articlePrune.executed).toBe(true);
    });

    it("should skip token cleanup when 7 days not elapsed", async () => {
      // Set lastTokenCleanupAt to 3 days ago
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastTokenCleanupAt: threeDaysAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleTokenCleanup } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleTokenCleanup).not.toHaveBeenCalled();
      expect(result.tokenCleanup.executed).toBe(false);
      expect(result.tokenCleanup.skippedReason).toContain("days ago");
    });

    it("should execute token cleanup when 7 days elapsed", async () => {
      // Set lastTokenCleanupAt to 8 days ago
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastTokenCleanupAt: eightDaysAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleTokenCleanup } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleTokenCleanup).toHaveBeenCalledWith(env);
      expect(result.tokenCleanup.executed).toBe(true);
    });

    it("should update timestamps after execution", async () => {
      await executeScheduledTasks(env, db);

      // Check that timestamps were updated
      const [settings] = await db
        .select()
        .from(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));

      expect(settings?.lastRssFetchAt).not.toBeNull();
      expect(settings?.lastPruneAt).not.toBeNull();
      expect(settings?.lastTokenCleanupAt).not.toBeNull();
    });

    it("should respect fetchIntervalMinutes setting", async () => {
      // Set fetch interval to 30 minutes
      await db
        .update(schema.globalSettings)
        .set({ fetchIntervalMinutes: 30 })
        .where(eq(schema.globalSettings.id, 1));

      // Set lastRssFetchAt to 35 minutes ago (should trigger)
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await db
        .update(schema.globalSettings)
        .set({ lastRssFetchAt: thirtyFiveMinutesAgo })
        .where(eq(schema.globalSettings.id, 1));

      const { handleRSSFetch } = await import("../handlers");

      const result = await executeScheduledTasks(env, db);

      expect(handleRSSFetch).toHaveBeenCalled();
      expect(result.rssFetch.executed).toBe(true);
    });

    it("should emit metrics for executed tasks", async () => {
      const { emitCounter } = await import("@/utils/metrics");

      await executeScheduledTasks(env, db);

      expect(emitCounter).toHaveBeenCalledWith("cron.rss_fetch_triggered", 1, {
        status: "executed",
      });
      expect(emitCounter).toHaveBeenCalledWith("cron.prune_triggered", 1, {
        status: "executed",
      });
      expect(emitCounter).toHaveBeenCalledWith(
        "cron.token_cleanup_triggered",
        1,
        { status: "executed" }
      );
    });

    it("should emit metrics for skipped tasks", async () => {
      // Set all timestamps to recent (skip all)
      const now = new Date();
      await db
        .update(schema.globalSettings)
        .set({
          lastRssFetchAt: now,
          lastPruneAt: now,
          lastTokenCleanupAt: now,
        })
        .where(eq(schema.globalSettings.id, 1));

      const { emitCounter } = await import("@/utils/metrics");

      await executeScheduledTasks(env, db);

      expect(emitCounter).toHaveBeenCalledWith("cron.rss_fetch_triggered", 1, {
        status: "skipped",
      });
      expect(emitCounter).toHaveBeenCalledWith("cron.prune_triggered", 1, {
        status: "skipped",
      });
      expect(emitCounter).toHaveBeenCalledWith(
        "cron.token_cleanup_triggered",
        1,
        { status: "skipped" }
      );
    });
  });
});
