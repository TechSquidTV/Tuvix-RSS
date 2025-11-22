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

      expect(result.total).toBe(2);
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

      expect(result.total).toBe(2);
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

      expect(result.total).toBe(0);
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

      expect(result.total).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
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
});
