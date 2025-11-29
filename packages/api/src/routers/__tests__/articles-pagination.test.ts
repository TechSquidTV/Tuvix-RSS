/**
 * Articles Router Pagination Tests
 *
 * Tests for pagination, total count accuracy, and hasMore logic
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
} from "@/test/setup";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { articlesRouter } from "../articles";

describe("Articles Router - Pagination & Count", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let testSource: { id: number };
  let testSubscription: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    testSource = await seedTestSource(db, {
      url: "https://example.com/feed.xml",
      title: "Test Feed",
    });

    testSubscription = await seedTestSubscription(
      db,
      testUser.id,
      testSource.id,
      {
        filterEnabled: false, // No filtering for accurate count tests
      }
    );
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  /**
   * Helper to create multiple test articles
   */
  async function createArticles(count: number) {
    const articles = Array.from({ length: count }, (_, i) => ({
      sourceId: testSource.id,
      guid: `guid-${Date.now()}-${i}`,
      title: `Article ${i + 1}`,
      link: `https://example.com/article${i}`,
      publishedAt: new Date(Date.now() - i * 60000), // Stagger by minutes for robust ordering
      createdAt: new Date(),
    }));

    await db.insert(schema.articles).values(articles);
  }

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return articlesRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {},
      req: {} as any,
    });
  }

  describe("Total Count Accuracy", () => {
    it("should return accurate total count without subscription filters", async () => {
      const caller = createCaller();

      // Create 50 articles
      await createArticles(50);

      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      // Should return accurate count of all articles
      expect(result.total).toBe(50);
      expect(result.items).toHaveLength(20);
    });

    it("should return accurate total count with offset", async () => {
      const caller = createCaller();

      // Create 30 articles
      await createArticles(30);

      const result = await caller.list({
        limit: 10,
        offset: 20,
      });

      // Total should still be 30 (not 20 + offset)
      expect(result.total).toBe(30);
      expect(result.items).toHaveLength(10);
    });

    it("should return accurate count with read filter", async () => {
      const caller = createCaller();

      // Create 20 articles
      await createArticles(20);

      // Mark 5 as read
      const articles = await db.select().from(schema.articles).limit(5);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      // Query only read articles
      const result = await caller.list({
        limit: 10,
        offset: 0,
        read: true,
      });

      // Should accurately count only read articles
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(5);
    });

    it("should return accurate count with unread filter", async () => {
      const caller = createCaller();

      // Create 30 articles
      await createArticles(30);

      // Mark 10 as read
      const articles = await db.select().from(schema.articles).limit(10);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      // Query unread articles
      const result = await caller.list({
        limit: 20,
        offset: 0,
        read: false,
      });

      // Should accurately count unread articles (30 - 10 = 20)
      expect(result.total).toBe(20);
      expect(result.items).toHaveLength(20);
    });

    it("should return accurate count with saved filter", async () => {
      const caller = createCaller();

      // Create 25 articles
      await createArticles(25);

      // Mark 7 as saved
      const articles = await db.select().from(schema.articles).limit(7);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: false,
          saved: true,
          updatedAt: new Date(),
        });
      }

      // Query saved articles
      const result = await caller.list({
        limit: 20,
        offset: 0,
        saved: true,
      });

      // Should accurately count saved articles
      expect(result.total).toBe(7);
      expect(result.items).toHaveLength(7);
    });

    it("should return approximate total with subscription filters enabled", async () => {
      const caller = createCaller();

      // Enable subscription filtering
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: true, filterMode: "include" })
        .where(eq(schema.subscriptions.id, testSubscription.id));

      // Add a filter
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription.id,
        field: "title",
        matchType: "contains",
        pattern: "Important",
        createdAt: new Date(),
      });

      // Create 50 articles (some match filter, some don't)
      for (let i = 0; i < 50; i++) {
        await db.insert(schema.articles).values({
          sourceId: testSource.id,
          guid: `guid-${Date.now()}-${i}`,
          title: i % 5 === 0 ? `Important Article ${i}` : `Article ${i}`,
          link: `https://example.com/article${i}`,
          publishedAt: new Date(Date.now() - i * 1000),
          createdAt: new Date(),
        });
      }

      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      // With subscription filters, total is approximate
      // It should be result length + offset (not the full 50)
      expect(result.total).toBeLessThan(50);
      expect(result.total).toBeGreaterThanOrEqual(result.items.length);
    });
  });

  describe("hasMore Pagination Logic", () => {
    it("should return hasMore=true when more articles exist", async () => {
      const caller = createCaller();

      // Create 50 articles
      await createArticles(50);

      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      // Should indicate more articles exist
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(20);
    });

    it("should return hasMore=false when at the end", async () => {
      const caller = createCaller();

      // Create 25 articles
      await createArticles(25);

      const result = await caller.list({
        limit: 20,
        offset: 20,
      });

      // Only 5 articles left, should indicate no more
      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(5);
    });

    it("should return hasMore=false when exactly at limit", async () => {
      const caller = createCaller();

      // Create exactly 40 articles
      await createArticles(40);

      const result = await caller.list({
        limit: 20,
        offset: 20,
      });

      // Exactly at the end
      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(20);
    });

    it("should correctly handle hasMore with filters", async () => {
      const caller = createCaller();

      // Create 50 articles
      await createArticles(50);

      // Mark first 15 as read
      const articles = await db.select().from(schema.articles).limit(15);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      // Query unread articles (35 total)
      const result = await caller.list({
        limit: 20,
        offset: 0,
        read: false,
      });

      // Should have more unread articles
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(35);
    });

    it("should handle empty result set correctly", async () => {
      const caller = createCaller();

      // No articles created

      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("Pagination Edge Cases", () => {
    it("should handle offset beyond total articles", async () => {
      const caller = createCaller();

      // Create 20 articles
      await createArticles(20);

      const result = await caller.list({
        limit: 20,
        offset: 50, // Beyond total
      });

      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(20); // Still returns accurate total
    });

    it("should handle limit larger than total articles", async () => {
      const caller = createCaller();

      // Create 10 articles
      await createArticles(10);

      const result = await caller.list({
        limit: 50,
        offset: 0,
      });

      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(10);
    });

    it("should maintain consistent ordering across pages", async () => {
      const caller = createCaller();

      // Create 30 articles with specific timestamps
      await createArticles(30);

      // Fetch first page
      const page1 = await caller.list({
        limit: 10,
        offset: 0,
      });

      // Fetch second page
      const page2 = await caller.list({
        limit: 10,
        offset: 10,
      });

      // Verify no overlap
      const page1Ids = page1.items.map((a) => a.id);
      const page2Ids = page2.items.map((a) => a.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));

      expect(overlap).toHaveLength(0);

      // Verify ordering (newest first by publishedAt)
      const allTimestamps = [...page1.items, ...page2.items].map(
        (a) => a.publishedAt?.getTime() ?? 0
      );

      // Should be in descending order (newest first)
      for (let i = 1; i < allTimestamps.length; i++) {
        expect(allTimestamps[i]).toBeLessThanOrEqual(allTimestamps[i - 1]);
      }
    });
  });
});
