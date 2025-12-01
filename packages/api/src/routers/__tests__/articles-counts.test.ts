/**
 * Articles Router - Get Counts Endpoint Tests
 *
 * Tests for the optimized getCounts endpoint that replaces
 * fetching 4 full article queries just to get badge counts
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
import { articlesRouter } from "../articles";

describe("Articles Router - getCounts", () => {
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

    // Create subscription
    await seedTestSubscription(db, testUser.id, testSource.id, {
      filterEnabled: false,
    });
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  function createCaller() {
    return articlesRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {},
      req: {} as any,
    });
  }

  async function createArticles(count: number) {
    const articles = Array.from({ length: count }, (_, i) => ({
      sourceId: testSource.id,
      guid: `guid-${Date.now()}-${i}`,
      title: `Article ${i + 1}`,
      link: `https://example.com/article${i}`,
      publishedAt: new Date(Date.now() - i * 60000),
      createdAt: new Date(),
    }));

    await db.insert(schema.articles).values(articles);
  }

  describe("Basic Counts", () => {
    it("should return zero counts when no articles exist", async () => {
      const caller = createCaller();
      const counts = await caller.getCounts({});

      expect(counts).toEqual({
        all: 0,
        unread: 0,
        read: 0,
        saved: 0,
      });
    });

    it("should return accurate all count", async () => {
      const caller = createCaller();

      await createArticles(50);

      const counts = await caller.getCounts({});

      expect(counts.all).toBe(50);
    });

    it("should count all articles as unread by default", async () => {
      const caller = createCaller();

      await createArticles(30);

      const counts = await caller.getCounts({});

      expect(counts.all).toBe(30);
      expect(counts.unread).toBe(30);
      expect(counts.read).toBe(0);
    });
  });

  describe("Read/Unread Counts", () => {
    it("should accurately count read articles", async () => {
      const caller = createCaller();

      await createArticles(20);

      // Mark 8 articles as read
      const articles = await db.select().from(schema.articles).limit(8);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      const counts = await caller.getCounts({});

      expect(counts.all).toBe(20);
      expect(counts.read).toBe(8);
      expect(counts.unread).toBe(12); // 20 - 8 = 12
    });

    it("should count articles with no state as unread", async () => {
      const caller = createCaller();

      await createArticles(15);

      // Mark 5 explicitly as read=false
      const articles = await db.select().from(schema.articles).limit(5);
      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: false,
          saved: false,
          updatedAt: new Date(),
        });
      }

      const counts = await caller.getCounts({});

      // All 15 should be unread (5 explicit false + 10 null)
      expect(counts.unread).toBe(15);
      expect(counts.read).toBe(0);
    });
  });

  describe("Saved Counts", () => {
    it("should accurately count saved articles", async () => {
      const caller = createCaller();

      await createArticles(25);

      // Mark 7 articles as saved
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

      const counts = await caller.getCounts({});

      expect(counts.all).toBe(25);
      expect(counts.saved).toBe(7);
    });

    it("should count saved articles regardless of read status", async () => {
      const caller = createCaller();

      await createArticles(20);

      const articles = await db.select().from(schema.articles).limit(10);

      // Mark 5 as saved+read
      for (let i = 0; i < 5; i++) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: articles[i].id,
          read: true,
          saved: true,
          updatedAt: new Date(),
        });
      }

      // Mark 5 as saved+unread
      for (let i = 5; i < 10; i++) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: articles[i].id,
          read: false,
          saved: true,
          updatedAt: new Date(),
        });
      }

      const counts = await caller.getCounts({});

      expect(counts.saved).toBe(10); // All saved regardless of read status
      expect(counts.read).toBe(5);
      expect(counts.unread).toBe(15); // 20 - 5 read = 15 unread
    });
  });

  describe("Category Filtering", () => {
    it("should filter counts by category", async () => {
      const caller = createCaller();

      // Create category
      const [category] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "Tech",
          color: "#FF0000",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create second source and subscription in category
      const [techSource] = await db
        .insert(schema.sources)
        .values({
          url: "https://tech.com/feed.xml",
          title: "Tech Feed",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const [techSubscription] = await db
        .insert(schema.subscriptions)
        .values({
          userId: testUser.id,
          sourceId: techSource.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Associate with category
      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: techSubscription.id,
        categoryId: category.id,
      });

      // Create articles in both sources
      await createArticles(10); // testSource (not in category)

      await db.insert(schema.articles).values(
        Array.from({ length: 5 }, (_, i) => ({
          sourceId: techSource.id,
          guid: `tech-guid-${i}`,
          title: `Tech Article ${i}`,
          link: `https://tech.com/article${i}`,
          publishedAt: new Date(),
          createdAt: new Date(),
        }))
      );

      // Get counts with category filter
      const counts = await caller.getCounts({ categoryId: category.id });

      expect(counts.all).toBe(5); // Only tech articles
    });
  });

  describe("Subscription Filtering", () => {
    it("should filter counts by subscription", async () => {
      const caller = createCaller();

      // Create second subscription
      const [otherSource] = await db
        .insert(schema.sources)
        .values({
          url: "https://other.com/feed.xml",
          title: "Other Feed",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const [otherSubscription] = await db
        .insert(schema.subscriptions)
        .values({
          userId: testUser.id,
          sourceId: otherSource.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create articles in both sources
      await createArticles(10); // testSource

      await db.insert(schema.articles).values(
        Array.from({ length: 7 }, (_, i) => ({
          sourceId: otherSource.id,
          guid: `other-guid-${i}`,
          title: `Other Article ${i}`,
          link: `https://other.com/article${i}`,
          publishedAt: new Date(),
          createdAt: new Date(),
        }))
      );

      // Get counts for specific subscription
      const counts = await caller.getCounts({
        subscriptionId: otherSubscription.id,
      });

      expect(counts.all).toBe(7); // Only other subscription articles
    });
  });

  describe("Performance", () => {
    it("should handle large datasets efficiently", async () => {
      const caller = createCaller();

      // Create 500 articles
      await createArticles(500);

      // Mark various states
      const articles = await db.select().from(schema.articles);

      // Mark first 100 as read
      for (let i = 0; i < 100; i++) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: articles[i].id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      // Mark 50 as saved
      for (let i = 200; i < 250; i++) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: articles[i].id,
          read: false,
          saved: true,
          updatedAt: new Date(),
        });
      }

      const startTime = Date.now();
      const counts = await caller.getCounts({});
      const duration = Date.now() - startTime;

      expect(counts.all).toBe(500);
      expect(counts.read).toBe(100);
      expect(counts.unread).toBe(400);
      expect(counts.saved).toBe(50);

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
