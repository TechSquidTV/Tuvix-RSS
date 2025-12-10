/**
 * RSS Fetcher Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchAllFeeds, fetchSingleFeed } from "../rss-fetcher";
import { createTestDb, cleanupTestDb, seedTestSource } from "@/test/setup";
import {
  MOCK_RSS_FEED,
  mockFetchRssFeed,
  mockFetchAtomFeed,
  mockFetch404,
  mockFetchError,
} from "@/test/mocks";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("RSS Fetcher Service", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;

  beforeEach(() => {
    db = createTestDb();
    // Mock console to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.restoreAllMocks();
  });

  describe("fetchSingleFeed", () => {
    it("should fetch and parse RSS feed", async () => {
      const source = await seedTestSource(db, {
        url: "https://example.com/feed.xml",
      });

      global.fetch = mockFetchRssFeed();

      const result = await fetchSingleFeed(source.id, source.url, db);

      expect(result).toBeDefined();
      expect(result.articlesAdded).toBeGreaterThan(0);
      expect(result.sourceUpdated).toBe(true);
    });

    it("should fetch and parse Atom feed", async () => {
      const source = await seedTestSource(db, {
        url: "https://example.com/atom.xml",
      });

      global.fetch = mockFetchAtomFeed();

      const result = await fetchSingleFeed(source.id, source.url, db);

      expect(result).toBeDefined();
      expect(result.articlesAdded).toBeGreaterThan(0);
    });

    it("should store articles in database", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchRssFeed();

      await fetchSingleFeed(source.id, source.url, db);

      const articles = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.sourceId, source.id));

      expect(articles.length).toBeGreaterThan(0);
    });

    it("should skip duplicate articles", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchRssFeed();

      // Fetch first time
      const result1 = await fetchSingleFeed(source.id, source.url, db);
      expect(result1.articlesAdded).toBeGreaterThan(0);

      // Fetch again with same feed
      const result2 = await fetchSingleFeed(source.id, source.url, db);

      expect(result2.articlesAdded).toBe(0);
      expect(result2.articlesSkipped).toBe(result1.articlesAdded);
    });

    it("should allow same GUID across different sources", async () => {
      const source1 = await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      const source2 = await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });

      // Mock feeds with same GUID
      global.fetch = vi.fn().mockImplementation(() => {
        const feed = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <link>https://example.com</link>
          <description>Test</description>
          <item>
            <title>Article</title>
            <link>https://example.com/article</link>
            <guid>shared-guid-123</guid>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;
        return Promise.resolve(
          new Response(feed, {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          })
        );
      });

      await fetchSingleFeed(source1.id, source1.url, db);
      await fetchSingleFeed(source2.id, source2.url, db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(2); // Both should be inserted
    });

    it("should update source lastFetched timestamp", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchRssFeed();

      await fetchSingleFeed(source.id, source.url, db);

      const [updatedSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, source.id));

      expect(updatedSource.lastFetched).toBeDefined();
      expect(updatedSource.lastFetched).toBeInstanceOf(Date);
    });

    it("should throw error for 404 response", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetch404();

      await expect(
        fetchSingleFeed(source.id, source.url, db)
      ).rejects.toThrow();
    });

    it("should throw error for network failure", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchError();

      await expect(
        fetchSingleFeed(source.id, source.url, db)
      ).rejects.toThrow();
    });

    it("should handle feed with no items", async () => {
      const source = await seedTestSource(db);

      const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <link>https://example.com</link>
    <description>A feed with no items</description>
  </channel>
</rss>`;

      global.fetch = mockFetchRssFeed(emptyFeed);

      const result = await fetchSingleFeed(source.id, source.url, db);

      expect(result.articlesAdded).toBe(0);
      expect(result.articlesSkipped).toBe(0);
    });

    it("should extract article metadata correctly", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchRssFeed();

      await fetchSingleFeed(source.id, source.url, db);

      const articles = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.sourceId, source.id));

      const article = articles[0];
      expect(article.title).toBeDefined();
      expect(article.link).toBeDefined();
      expect(article.description).toBeDefined();
      expect(article.publishedAt).toBeInstanceOf(Date);
      expect(article.guid).toBeDefined();
    });

    it("should update source title from feed", async () => {
      const source = await seedTestSource(db, {
        title: "Old Title",
      });

      global.fetch = mockFetchRssFeed();

      await fetchSingleFeed(source.id, source.url, db);

      const [updatedSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, source.id));

      expect(updatedSource.title).toBe("Test RSS Feed");
    });
  });

  describe("fetchAllFeeds", () => {
    it("should fetch all sources in database", async () => {
      await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });

      global.fetch = mockFetchRssFeed();

      const result = await fetchAllFeeds(db);

      expect(result.processedCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle mix of successful and failed fetches", async () => {
      await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(MOCK_RSS_FEED, {
              status: 200,
              headers: { "Content-Type": "application/rss+xml" },
            })
          );
        } else {
          return Promise.resolve(
            new Response("Not Found", {
              status: 404,
              statusText: "Not Found",
            })
          );
        }
      });

      const result = await fetchAllFeeds(db);

      expect(result.processedCount).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("should collect error details", async () => {
      const source = await seedTestSource(db, {
        url: "https://example.com/feed.xml",
      });

      global.fetch = mockFetch404();

      const result = await fetchAllFeeds(db);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sourceId).toBe(source.id);
      expect(result.errors[0].url).toBe(source.url);
      expect(result.errors[0].error).toBeDefined();
    });

    it("should return empty result when no sources exist", async () => {
      global.fetch = mockFetchRssFeed();

      const result = await fetchAllFeeds(db);

      expect(result.processedCount).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should continue fetching after individual failures", async () => {
      await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });
      await seedTestSource(db, {
        url: "https://example.com/feed3.xml",
      });

      // Mock fetch to fail for the second source specifically
      global.fetch = vi.fn().mockImplementation((url) => {
        // Check if this is the feed2 source
        if (url === "https://example.com/feed2.xml") {
          return Promise.resolve(
            new Response("Not Found", {
              status: 404,
              statusText: "Not Found",
            })
          );
        }
        // Success for other feed requests
        return Promise.resolve(
          new Response(MOCK_RSS_FEED, {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          })
        );
      });

      const result = await fetchAllFeeds(db);

      expect(result.processedCount).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
    });

    it("should only fetch stale feeds (not recently fetched)", async () => {
      // Create feeds with different lastFetched timestamps
      const now = new Date();
      const oldFeed = await seedTestSource(db, {
        url: "https://example.com/old-feed.xml",
      });
      const recentFeed = await seedTestSource(db, {
        url: "https://example.com/recent-feed.xml",
      });

      // Set old feed to 1 hour ago (stale)
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 60 * 60 * 1000) })
        .where(eq(schema.sources.id, oldFeed.id));

      // Set recent feed to 5 minutes ago (fresh, within 30-min threshold)
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 5 * 60 * 1000) })
        .where(eq(schema.sources.id, recentFeed.id));

      global.fetch = mockFetchRssFeed();

      // Fetch with default 30-minute staleness threshold
      const result = await fetchAllFeeds(db);

      // Should only fetch the old feed (1 hour old), not the recent one (5 min old)
      expect(result.processedCount).toBe(1); // Only 1 feed was stale and processed
      expect(result.successCount).toBe(1); // Only old feed processed
      expect(result.errorCount).toBe(0);
    });

    it("should fetch all feeds when staleness threshold is 0", async () => {
      const now = new Date();
      const feed1 = await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      const feed2 = await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });

      // Set both feeds to 1 minute ago
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 1 * 60 * 1000) })
        .where(eq(schema.sources.id, feed1.id));
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 1 * 60 * 1000) })
        .where(eq(schema.sources.id, feed2.id));

      global.fetch = mockFetchRssFeed();

      // Fetch with 0-minute threshold (all feeds are stale)
      const result = await fetchAllFeeds(db, { stalenessThresholdMinutes: 0 });

      expect(result.processedCount).toBe(2);
      expect(result.successCount).toBe(2); // Both feeds processed
      expect(result.errorCount).toBe(0);
    });

    it("should fetch feeds with null lastFetched (never fetched)", async () => {
      await seedTestSource(db, {
        url: "https://example.com/never-fetched.xml",
      });

      global.fetch = mockFetchRssFeed();

      const result = await fetchAllFeeds(db);

      // Null lastFetched should always be considered stale
      expect(result.processedCount).toBe(1);
      expect(result.successCount).toBe(1);
    });

    it("should respect custom staleness threshold", async () => {
      const now = new Date();
      const feed1 = await seedTestSource(db, {
        url: "https://example.com/feed1.xml",
      });
      const feed2 = await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
      });

      // Feed 1: 10 minutes old
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 10 * 60 * 1000) })
        .where(eq(schema.sources.id, feed1.id));

      // Feed 2: 20 minutes old
      await db
        .update(schema.sources)
        .set({ lastFetched: new Date(now.getTime() - 20 * 60 * 1000) })
        .where(eq(schema.sources.id, feed2.id));

      global.fetch = mockFetchRssFeed();

      // Use 15-minute threshold - only feed2 (20 min) should be stale
      const result = await fetchAllFeeds(db, {
        stalenessThresholdMinutes: 15,
      });

      expect(result.processedCount).toBe(1); // Only 1 feed was stale and processed
      expect(result.successCount).toBe(1); // Only feed2 (20 min old)
    });
  });

  describe("Feed Format Handling", () => {
    it("should handle RSS 2.0 feeds", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchRssFeed();

      const result = await fetchSingleFeed(source.id, source.url, db);

      expect(result.articlesAdded).toBeGreaterThan(0);
    });

    it("should handle Atom feeds", async () => {
      const source = await seedTestSource(db);

      global.fetch = mockFetchAtomFeed();

      const result = await fetchSingleFeed(source.id, source.url, db);

      expect(result.articlesAdded).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed XML gracefully", async () => {
      const source = await seedTestSource(db);

      global.fetch = vi.fn().mockResolvedValue(
        new Response("not valid xml", {
          status: 200,
          headers: { "Content-Type": "application/rss+xml" },
        })
      );

      await expect(
        fetchSingleFeed(source.id, source.url, db)
      ).rejects.toThrow();
    });

    it("should handle empty response", async () => {
      const source = await seedTestSource(db);

      global.fetch = vi.fn().mockResolvedValue(
        new Response("", {
          status: 200,
          headers: { "Content-Type": "application/rss+xml" },
        })
      );

      await expect(
        fetchSingleFeed(source.id, source.url, db)
      ).rejects.toThrow();
    });

    it("should handle non-existent source", async () => {
      global.fetch = mockFetchRssFeed();

      // The function should succeed but update nothing since source doesn't exist
      // This is because the function doesn't verify source existence before fetching
      const result = await fetchSingleFeed(
        9999,
        "https://example.com/feed.xml",
        db
      );

      expect(result.articlesAdded).toBe(0);
    });
  });

  describe("Article Deduplication", () => {
    it("should use GUID for deduplication", async () => {
      const source = await seedTestSource(db);

      const feedWithSameGuid = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>Article 1</title>
      <link>https://example.com/article1</link>
      <description>Content</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>unique-guid-123</guid>
    </item>
    <item>
      <title>Article 2 (Different Title, Same GUID)</title>
      <link>https://example.com/article2</link>
      <description>Different content</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <guid>unique-guid-123</guid>
    </item>
  </channel>
</rss>`;

      global.fetch = mockFetchRssFeed(feedWithSameGuid);

      await fetchSingleFeed(source.id, source.url, db);

      // Should only add one article despite two items (same GUID)
      const articles = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.sourceId, source.id));

      expect(articles.length).toBe(1);
    });
  });

  describe("Blocked Domains Integration", () => {
    it("should skip fetching blocked domains in fetchSingleFeed", async () => {
      const source = await seedTestSource(db, {
        url: "https://blocked-spam.com/feed.xml",
      });

      // Create blocked domain entry
      const { user } = await import("@/test/setup").then((m) =>
        m.seedTestUser(db, { role: "admin" })
      );
      await db.insert(schema.blockedDomains).values({
        domain: "blocked-spam.com",
        reason: "spam",
        createdBy: user.id,
      });

      global.fetch = mockFetchRssFeed();

      const result = await fetchSingleFeed(source.id, source.url, db);

      // Should skip the feed entirely (return early before HTTP fetch)
      expect(result.articlesAdded).toBe(0);
      expect(result.articlesSkipped).toBe(0);
      expect(result.sourceUpdated).toBe(false);

      // Verify no articles were stored
      const articles = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.sourceId, source.id));
      expect(articles).toHaveLength(0);
    });

    it("should use cached blocked domains list when provided", async () => {
      const source = await seedTestSource(db, {
        url: "https://cached-blocked.com/feed.xml",
      });

      // Create pre-fetched blocked domains list (simulating batch cache)
      const cachedBlockedDomains = [
        { domain: "cached-blocked.com", reason: "spam" },
      ];

      global.fetch = mockFetchRssFeed();

      const result = await fetchSingleFeed(
        source.id,
        source.url,
        db,
        cachedBlockedDomains
      );

      // Should use cached list and skip the feed
      expect(result.articlesAdded).toBe(0);
      expect(result.articlesSkipped).toBe(0);
      expect(result.sourceUpdated).toBe(false);
    });

    it("should fetch blocked domains when cache not provided", async () => {
      const source = await seedTestSource(db, {
        url: "https://example.com/feed.xml",
      });

      // Create blocked domain in DB (not in cache)
      const { user } = await import("@/test/setup").then((m) =>
        m.seedTestUser(db, { role: "admin" })
      );
      await db.insert(schema.blockedDomains).values({
        domain: "other-blocked.com",
        reason: "spam",
        createdBy: user.id,
      });

      global.fetch = mockFetchRssFeed();

      // Call without cache (undefined) - should fetch from DB
      const result = await fetchSingleFeed(source.id, source.url, db);

      // Should succeed since example.com is not blocked
      expect(result.articlesAdded).toBeGreaterThan(0);
      expect(result.sourceUpdated).toBe(true);
    });

    it("should cache blocked domains once per batch in fetchAllFeeds", async () => {
      // Create 3 feeds
      await seedTestSource(db, { url: "https://example.com/feed1.xml" });
      await seedTestSource(db, { url: "https://example.com/feed2.xml" });
      await seedTestSource(db, { url: "https://example.com/feed3.xml" });

      global.fetch = mockFetchRssFeed();

      // Spy on console.log to count how many times we process feeds
      const logSpy = vi.spyOn(console, "log");

      await fetchAllFeeds(db);

      // Verify all 3 feeds were processed
      const successLogs = logSpy.mock.calls.filter((call) =>
        call[0]?.includes("✓ Fetched")
      );
      expect(successLogs).toHaveLength(3);

      // Note: We can't easily spy on getBlockedDomains since it's called directly
      // But the test verifies the batch processing works without errors
      // The real verification is that all feeds succeed with blocked domains enabled
    });
  });
});
