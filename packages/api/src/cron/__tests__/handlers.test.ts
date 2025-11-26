/**
 * Cron Handlers Tests
 *
 * Tests for cron job handlers (RSS fetch and article pruning)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleRSSFetch, handleArticlePrune } from "../handlers";
import { createTestDb, cleanupTestDb, seedTestSource } from "@/test/setup";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "@/types";

// Mock dependencies
vi.mock("@/services/rss-fetcher", () => ({
  fetchAllFeeds: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  createDatabase: vi.fn(),
}));

vi.mock("@/services/global-settings", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/global-settings")
  >("@/services/global-settings");
  return {
    ...actual,
    getGlobalSettings: vi.fn().mockImplementation(actual.getGlobalSettings),
  };
});

describe("Cron Handlers", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let env: Env;

  beforeEach(async () => {
    db = createTestDb();
    env = {
      BETTER_AUTH_SECRET: "test-secret",
      RUNTIME: "nodejs",
    } as Env;

    // Mock createDatabase to return our test db
    const { createDatabase } = await import("@/db/client");
    vi.mocked(createDatabase).mockReturnValue(db as any);
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.clearAllMocks();
  });

  describe("handleRSSFetch", () => {
    it("should successfully fetch all RSS feeds", async () => {
      const { fetchAllFeeds } = await import("@/services/rss-fetcher");
      vi.mocked(fetchAllFeeds).mockResolvedValue({
        total: 5,
        successCount: 4,
        errorCount: 1,
        errors: [
          {
            sourceId: 1,
            url: "https://example.com/feed.xml",
            error: "Network error",
          },
        ],
      });

      await handleRSSFetch(env);

      expect(fetchAllFeeds).toHaveBeenCalledWith(db);
    });

    it("should log results when fetch completes", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { fetchAllFeeds } = await import("@/services/rss-fetcher");
      vi.mocked(fetchAllFeeds).mockResolvedValue({
        total: 3,
        successCount: 3,
        errorCount: 0,
        errors: [],
      });

      await handleRSSFetch(env);

      expect(consoleSpy).toHaveBeenCalledWith(
        "🔄 Starting scheduled RSS fetch..."
      );
      expect(consoleSpy).toHaveBeenCalledWith("✅ RSS fetch completed:", {
        total: 3,
        success: 3,
        errors: 0,
      });

      consoleSpy.mockRestore();
    });

    it("should throw error when fetchAllFeeds fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { fetchAllFeeds } = await import("@/services/rss-fetcher");
      const error = new Error("Database connection failed");
      vi.mocked(fetchAllFeeds).mockRejectedValue(error);

      await expect(handleRSSFetch(env)).rejects.toThrow(
        "Database connection failed"
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "❌ RSS fetch failed:",
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("handleArticlePrune", () => {
    let testSource: { id: number };

    beforeEach(async () => {
      // Clear any existing articles
      await db.delete(schema.articles);

      // Delete migration-seeded row first (migration creates id=1)
      await db.delete(schema.globalSettings).where(eq(schema.globalSettings.id, 1));

      // Seed global settings
      await db.insert(schema.globalSettings).values({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      });

      // Reset mock to use real implementation (default behavior)
      const { getGlobalSettings } = await import("@/services/global-settings");
      const actual = await vi.importActual<
        typeof import("@/services/global-settings")
      >("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockReset();
      vi.mocked(getGlobalSettings).mockImplementation(actual.getGlobalSettings);

      // Create a test source for articles
      testSource = await seedTestSource(db);
    });

    it("should prune articles older than configured days", async () => {
      // Create old articles (older than 30 days)
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      await db.insert(schema.articles).values([
        {
          sourceId: testSource.id,
          guid: "guid1",
          title: "Old Article 1",
          link: "https://example.com/article1",
          publishedAt: oldDate,
          createdAt: oldDate,
        },
        {
          sourceId: testSource.id,
          guid: "guid2",
          title: "Old Article 2",
          link: "https://example.com/article2",
          publishedAt: oldDate,
          createdAt: oldDate,
        },
      ]);

      // Create recent article (should not be pruned) - use today's date to ensure it's well within the 30-day window
      const recentDate = new Date(); // Today
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "guid3",
        title: "Recent Article",
        link: "https://example.com/recent",
        publishedAt: recentDate,
        createdAt: recentDate,
      });

      // Verify we have 3 articles before pruning
      const beforePrune = await db.select().from(schema.articles);
      expect(beforePrune).toHaveLength(3);

      const result = await handleArticlePrune(env);

      expect(result.deletedCount).toBe(2);

      // Verify old articles are deleted
      const remainingArticles = await db.select().from(schema.articles);
      expect(remainingArticles).toHaveLength(1);
      expect(remainingArticles[0].title).toBe("Recent Article");
    });

    it("should use createdAt when publishedAt is null", async () => {
      // Create article with null publishedAt but old createdAt
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "guid-no-published",
        title: "Article without publishedAt",
        link: "https://example.com/article",
        publishedAt: null,
        createdAt: oldDate,
      });

      const result = await handleArticlePrune(env);

      expect(result.deletedCount).toBe(1);

      const remainingArticles = await db.select().from(schema.articles);
      expect(remainingArticles).toHaveLength(0);
    });

    it("should return zero when no articles to prune", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Ensure no articles exist
      await db.delete(schema.articles);

      const result = await handleArticlePrune(env);

      expect(result.deletedCount).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith("✅ No articles to prune");

      consoleSpy.mockRestore();
    });

    it("should handle batch deletion for large numbers of articles", async () => {
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

      // Create 2000 articles (more than Cloudflare D1's 100 parameter limit)
      const articles = Array.from({ length: 2000 }, (_, i) => ({
        sourceId: testSource.id,
        guid: `guid-${i}`,
        title: `Old Article ${i}`,
        link: `https://example.com/article${i}`,
        publishedAt: oldDate,
        createdAt: oldDate,
      }));

      // Insert in batches to avoid memory issues
      for (let i = 0; i < articles.length; i += 100) {
        await db.insert(schema.articles).values(articles.slice(i, i + 100));
      }

      const result = await handleArticlePrune(env);

      expect(result.deletedCount).toBe(2000);

      const remainingArticles = await db.select().from(schema.articles);
      expect(remainingArticles).toHaveLength(0);
    });

    it("should use pruneDays from global settings", async () => {
      // Update global settings to use 7 days instead of 30
      await db
        .update(schema.globalSettings)
        .set({ pruneDays: 7 })
        .where(eq(schema.globalSettings.id, 1));

      // Note: getGlobalSettings will query the updated database

      // Create article that's 10 days old (should be pruned with 7-day setting)
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "guid-10-days",
        title: "10 Day Old Article",
        link: "https://example.com/article",
        publishedAt: oldDate,
        createdAt: oldDate,
      });

      const result = await handleArticlePrune(env);

      expect(result.deletedCount).toBe(1);
    });

    it("should log prune results", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "guid-old",
        title: "Old Article",
        link: "https://example.com/article",
        publishedAt: oldDate,
        createdAt: oldDate,
      });

      await handleArticlePrune(env);

      expect(consoleSpy).toHaveBeenCalledWith("🗑️ Starting article prune...");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Pruned 1 articles older than 30 days")
      );

      consoleSpy.mockRestore();
    });

    it("should throw error when prune fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Mock getGlobalSettings to throw an error
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockRejectedValue(
        new Error("Database connection failed")
      );

      await expect(handleArticlePrune(env)).rejects.toThrow(
        "Database connection failed"
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "❌ Article prune failed:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
