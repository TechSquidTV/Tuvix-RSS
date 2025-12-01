/**
 * Articles Router - Multi-Page Integration Tests
 *
 * Comprehensive integration tests for multi-page article fetching
 * Tests: accurate totals, no duplicates, working pagination across 4+ pages
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

describe("Articles Router - Multi-Page Integration", () => {
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

    // Create subscription (required for articles to be visible to user)
    await seedTestSubscription(db, testUser.id, testSource.id, {
      filterEnabled: false, // No filtering for accurate count tests
    });
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  /**
   * Helper to create multiple test articles with staggered timestamps
   */
  async function createArticles(count: number, startIndex: number = 0) {
    const articles = Array.from({ length: count }, (_, i) => ({
      sourceId: testSource.id,
      guid: `guid-${Date.now()}-${startIndex + i}`,
      title: `Article ${startIndex + i + 1}`,
      link: `https://example.com/article${startIndex + i}`,
      // Stagger by minutes for consistent ordering
      publishedAt: new Date(Date.now() - (startIndex + i) * 60000),
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

  describe("4+ Page Fetching", () => {
    it("should fetch 4 pages of articles with accurate totals and no duplicates", async () => {
      const caller = createCaller();

      // Create 100 articles total
      await createArticles(100);

      const pageSize = 25;
      const pages = [];
      const allArticleIds = new Set<number>();

      // Fetch 4 pages
      for (let pageNum = 0; pageNum < 4; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
        });

        pages.push(result);

        // Verify each article ID is unique
        for (const article of result.items) {
          expect(allArticleIds.has(article.id)).toBe(false);
          allArticleIds.add(article.id);
        }
      }

      // Verify all pages have correct total count
      for (const page of pages) {
        expect(page.total).toBe(100);
      }

      // Verify page sizes
      expect(pages[0].items).toHaveLength(25);
      expect(pages[1].items).toHaveLength(25);
      expect(pages[2].items).toHaveLength(25);
      expect(pages[3].items).toHaveLength(25);

      // Verify hasMore flags
      expect(pages[0].hasMore).toBe(true);
      expect(pages[1].hasMore).toBe(true);
      expect(pages[2].hasMore).toBe(true);
      expect(pages[3].hasMore).toBe(false); // Last page

      // Verify no duplicates across all pages
      expect(allArticleIds.size).toBe(100);

      // Verify consistent ordering (newest first)
      const allArticles = pages.flatMap((p) => p.items);
      for (let i = 1; i < allArticles.length; i++) {
        const prevTime = allArticles[i - 1].publishedAt?.getTime() ?? 0;
        const currTime = allArticles[i].publishedAt?.getTime() ?? 0;
        expect(currTime).toBeLessThanOrEqual(prevTime);
      }
    });

    it("should handle 5 pages with uneven distribution", async () => {
      const caller = createCaller();

      // Create 93 articles (5 pages: 20, 20, 20, 20, 13)
      await createArticles(93);

      const pageSize = 20;
      const pages = [];
      const allArticleIds = new Set<number>();

      // Fetch 5 pages
      for (let pageNum = 0; pageNum < 5; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
        });

        pages.push(result);

        // Track all IDs
        for (const article of result.items) {
          expect(allArticleIds.has(article.id)).toBe(false);
          allArticleIds.add(article.id);
        }
      }

      // Verify page sizes
      expect(pages[0].items).toHaveLength(20);
      expect(pages[1].items).toHaveLength(20);
      expect(pages[2].items).toHaveLength(20);
      expect(pages[3].items).toHaveLength(20);
      expect(pages[4].items).toHaveLength(13); // Partial last page

      // Verify hasMore flags
      expect(pages[0].hasMore).toBe(true);
      expect(pages[1].hasMore).toBe(true);
      expect(pages[2].hasMore).toBe(true);
      expect(pages[3].hasMore).toBe(true);
      expect(pages[4].hasMore).toBe(false); // Last page

      // Verify total count consistency
      for (const page of pages) {
        expect(page.total).toBe(93);
      }

      // Verify no duplicates
      expect(allArticleIds.size).toBe(93);
    });

    it("should handle 4 pages with read/unread filter", async () => {
      const caller = createCaller();

      // Create 100 articles
      await createArticles(100);

      // Mark first 60 as read
      const articles = await db
        .select()
        .from(schema.articles)
        .orderBy(schema.articles.publishedAt)
        .limit(60);

      for (const article of articles) {
        await db.insert(schema.userArticleStates).values({
          userId: testUser.id,
          articleId: article.id,
          read: true,
          saved: false,
          updatedAt: new Date(),
        });
      }

      // Fetch 4 pages of unread articles (40 total unread)
      const pageSize = 10;
      const pages = [];
      const allArticleIds = new Set<number>();

      for (let pageNum = 0; pageNum < 4; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
          read: false, // Only unread
        });

        pages.push(result);

        // Track all IDs
        for (const article of result.items) {
          expect(allArticleIds.has(article.id)).toBe(false);
          allArticleIds.add(article.id);
          // Verify all are actually unread
          expect(article.read).toBe(false);
        }
      }

      // Verify page sizes
      expect(pages[0].items).toHaveLength(10);
      expect(pages[1].items).toHaveLength(10);
      expect(pages[2].items).toHaveLength(10);
      expect(pages[3].items).toHaveLength(10);

      // Verify total count (should be 40 unread)
      for (const page of pages) {
        expect(page.total).toBe(40);
      }

      // Verify hasMore flags
      expect(pages[0].hasMore).toBe(true);
      expect(pages[1].hasMore).toBe(true);
      expect(pages[2].hasMore).toBe(true);
      expect(pages[3].hasMore).toBe(false); // Last page

      // Verify no duplicates
      expect(allArticleIds.size).toBe(40);
    });

    it("should maintain accurate counts when articles are added between fetches", async () => {
      const caller = createCaller();

      // Create initial 50 articles
      await createArticles(50);

      // Fetch first page
      const page1 = await caller.list({
        limit: 20,
        offset: 0,
      });

      expect(page1.items).toHaveLength(20);
      expect(page1.total).toBe(50);
      expect(page1.hasMore).toBe(true);

      // Add 30 more articles
      await createArticles(30, 50);

      // Fetch second page - total should now be 80
      const page2 = await caller.list({
        limit: 20,
        offset: 20,
      });

      expect(page2.items).toHaveLength(20);
      expect(page2.total).toBe(80); // Updated total
      expect(page2.hasMore).toBe(true);

      // Verify no duplicates between pages
      const page1Ids = page1.items.map((a) => a.id);
      const page2Ids = page2.items.map((a) => a.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it("should handle large dataset (10 pages of 50 items each)", async () => {
      const caller = createCaller();

      // Create 500 articles
      await createArticles(500);

      const pageSize = 50;
      const numPages = 10;
      const allArticleIds = new Set<number>();
      let previousLastTimestamp: number | null = null;

      // Fetch all 10 pages
      for (let pageNum = 0; pageNum < numPages; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
        });

        // Verify page size
        expect(result.items).toHaveLength(pageSize);

        // Verify total count
        expect(result.total).toBe(500);

        // Verify hasMore flag
        if (pageNum < numPages - 1) {
          expect(result.hasMore).toBe(true);
        } else {
          expect(result.hasMore).toBe(false);
        }

        // Track all IDs and verify no duplicates
        for (const article of result.items) {
          expect(allArticleIds.has(article.id)).toBe(false);
          allArticleIds.add(article.id);
        }

        // Verify ordering within page
        const timestamps = result.items.map(
          (a) => a.publishedAt?.getTime() ?? 0
        );
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
        }

        // Verify ordering across pages
        if (previousLastTimestamp !== null && result.items.length > 0) {
          const firstTimestamp = result.items[0].publishedAt?.getTime() ?? 0;
          expect(firstTimestamp).toBeLessThanOrEqual(previousLastTimestamp);
        }

        // Track last timestamp for next iteration
        if (result.items.length > 0) {
          previousLastTimestamp =
            result.items[result.items.length - 1].publishedAt?.getTime() ?? 0;
        }
      }

      // Final verification: no duplicates across all pages
      expect(allArticleIds.size).toBe(500);
    });

    it("should handle pagination with saved filter across 4 pages", async () => {
      const caller = createCaller();

      // Create 80 articles
      await createArticles(80);

      // Mark every other article as saved (40 saved total)
      const allArticles = await db.select().from(schema.articles);

      for (let i = 0; i < allArticles.length; i++) {
        if (i % 2 === 0) {
          await db.insert(schema.userArticleStates).values({
            userId: testUser.id,
            articleId: allArticles[i].id,
            read: false,
            saved: true,
            updatedAt: new Date(),
          });
        }
      }

      // Fetch 4 pages of saved articles
      const pageSize = 10;
      const pages = [];
      const allSavedIds = new Set<number>();

      for (let pageNum = 0; pageNum < 4; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
          saved: true,
        });

        pages.push(result);

        // Verify all items are actually saved
        for (const article of result.items) {
          expect(article.saved).toBe(true);
          expect(allSavedIds.has(article.id)).toBe(false);
          allSavedIds.add(article.id);
        }
      }

      // Verify page sizes
      expect(pages[0].items).toHaveLength(10);
      expect(pages[1].items).toHaveLength(10);
      expect(pages[2].items).toHaveLength(10);
      expect(pages[3].items).toHaveLength(10);

      // Verify total count (40 saved)
      for (const page of pages) {
        expect(page.total).toBe(40);
      }

      // Verify no duplicates
      expect(allSavedIds.size).toBe(40);
    });
  });

  describe("Edge Cases in Multi-Page Scenarios", () => {
    it("should handle fetching beyond available pages", async () => {
      const caller = createCaller();

      // Create 50 articles
      await createArticles(50);

      // Try to fetch page 6 (offset 100, only 50 articles exist)
      const result = await caller.list({
        limit: 20,
        offset: 100,
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(50);
      expect(result.hasMore).toBe(false);
    });

    it("should handle concurrent page fetches correctly", async () => {
      const caller = createCaller();

      // Create 100 articles
      await createArticles(100);

      // Fetch multiple pages concurrently
      const [page1, page2, page3, page4] = await Promise.all([
        caller.list({ limit: 25, offset: 0 }),
        caller.list({ limit: 25, offset: 25 }),
        caller.list({ limit: 25, offset: 50 }),
        caller.list({ limit: 25, offset: 75 }),
      ]);

      // Verify all pages have correct data
      expect(page1.items).toHaveLength(25);
      expect(page2.items).toHaveLength(25);
      expect(page3.items).toHaveLength(25);
      expect(page4.items).toHaveLength(25);

      // Verify no duplicates
      const allIds = new Set([
        ...page1.items.map((a) => a.id),
        ...page2.items.map((a) => a.id),
        ...page3.items.map((a) => a.id),
        ...page4.items.map((a) => a.id),
      ]);

      expect(allIds.size).toBe(100);

      // Verify all have same total
      expect(page1.total).toBe(100);
      expect(page2.total).toBe(100);
      expect(page3.total).toBe(100);
      expect(page4.total).toBe(100);
    });

    it("should handle small page sizes across many pages", async () => {
      const caller = createCaller();

      // Create 50 articles
      await createArticles(50);

      // Fetch with very small page size (5 items = 10 pages)
      const pageSize = 5;
      const numPages = 10;
      const allIds = new Set<number>();

      for (let pageNum = 0; pageNum < numPages; pageNum++) {
        const result = await caller.list({
          limit: pageSize,
          offset: pageNum * pageSize,
        });

        expect(result.items).toHaveLength(5);
        expect(result.total).toBe(50);

        for (const article of result.items) {
          allIds.add(article.id);
        }
      }

      // Verify all articles fetched exactly once
      expect(allIds.size).toBe(50);
    });
  });
});
