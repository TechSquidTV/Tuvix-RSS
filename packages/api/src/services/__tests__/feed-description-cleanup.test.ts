/**
 * Feed Description Cleanup Tests
 *
 * Tests the cleanup of feed-specific patterns in article descriptions.
 * These patterns are removed because we display them in dedicated UI elements.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, cleanupTestDb, seedTestSource } from "@/test/setup";
import * as schema from "@/db/schema";
import { fetchSingleFeed } from "../rss-fetcher";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("Feed Description Cleanup", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testSourceId: number;

  beforeEach(async () => {
    db = createTestDb();

    // Seed test source
    const source = await seedTestSource(db, {
      url: "https://test.example.com/feed",
      title: "Test Feed",
    });
    testSourceId = source.id;

    // Mock console to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupTestDb(db);
    mockFetch.mockReset();
    vi.restoreAllMocks();
  });

  describe("Reddit Feed Cleanup", () => {
    it("should remove 'submitted by /u/username' with link", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Reddit Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://reddit.com/r/test/comments/123/test</link>
              <guid>https://reddit.com/r/test/comments/123/test</guid>
              <description>
                submitted by <a href="https://www.reddit.com/user/testuser">/u/testuser</a><br/>
                <a href="https://example.com">[link]</a>
                <a href="https://reddit.com/r/test/comments/123/test">[comments]</a>
              </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
    });

    it("should remove 'submitted by /u/username' without link", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Reddit Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://reddit.com/r/test/comments/123/test</link>
              <guid>reddit-123</guid>
              <description>submitted by /u/testuser<br/><a href="https://reddit.com/r/test/comments/123/test">[comments]</a></description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
    });

    it("should remove [link] and [comments] links", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Reddit Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://reddit.com/r/test/comments/123/test</link>
              <guid>reddit-123</guid>
              <description>
                <a href="https://example.com">[link]</a>
                <a href="https://reddit.com/r/test/comments/123/test">[comments]</a>
              </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
    });

    it("should preserve actual content while removing metadata", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Reddit Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://reddit.com/r/test/comments/123/test</link>
              <guid>reddit-123</guid>
              <description>
                This is actual article content that should be preserved.
                submitted by <a href="https://www.reddit.com/user/testuser">/u/testuser</a><br/>
                <a href="https://example.com">[link]</a>
                <a href="https://reddit.com/r/test/comments/123/test">[comments]</a>
              </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toContain(
        "This is actual article content that should be preserved."
      );
      expect(articles[0].description).not.toContain("submitted by");
      expect(articles[0].description).not.toContain("[link]");
      expect(articles[0].description).not.toContain("[comments]");
    });
  });

  describe("Hacker News Feed Cleanup", () => {
    it("should remove standalone 'Comments' link", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Hacker News</title>
            <item>
              <title>Show HN: My Project</title>
              <link>https://example.com/project</link>
              <guid>https://news.ycombinator.com/item?id=12345</guid>
              <description><a href="https://news.ycombinator.com/item?id=12345">Comments</a></description>
              <comments>https://news.ycombinator.com/item?id=12345</comments>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
      expect(articles[0].commentLink).toBe(
        "https://news.ycombinator.com/item?id=12345"
      );
    });

    it("should preserve description with 'Comments' as part of content", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Article About Comments</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description>Comments are an important part of community engagement. <a href="https://example.com">Read more</a></description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toContain("Comments are an important");
      expect(articles[0].description).toContain("Read more");
    });
  });

  describe("Whitespace and Line Break Cleanup", () => {
    it("should remove excessive line breaks", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description>First line<br/><br/><br/>Second line<br><br>Third line</description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      // Should reduce multiple <br> tags to single <br>
      expect(articles[0].description).not.toContain("<br><br>");
      expect(articles[0].description).not.toContain("<br/><br/>");
    });

    it("should trim leading and trailing whitespace", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description>   Content with spaces   </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("Content with spaces");
    });
  });

  describe("Case Insensitivity", () => {
    it("should handle uppercase [LINK] and [COMMENTS]", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description>
                <a href="https://example.com">[LINK]</a>
                <a href="https://example.com/comments">[COMMENTS]</a>
              </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
    });

    it("should handle mixed case 'Comments' link", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description><a href="https://example.com/comments">COMMENTS</a></description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toBe("");
    });
  });

  describe("Non-matching Feeds", () => {
    it("should not modify regular feed descriptions", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Regular Blog</title>
            <item>
              <title>Regular Article</title>
              <link>https://blog.example.com/article</link>
              <guid>blog-123</guid>
              <description>This is a regular article description with <a href="https://example.com">a normal link</a> that should be preserved.</description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toContain(
        "This is a regular article description"
      );
      expect(articles[0].description).toContain("a normal link");
    });

    it("should preserve HTML formatting", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <guid>test-123</guid>
              <description>This is <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      expect(articles[0].description).toContain("<strong>bold</strong>");
      expect(articles[0].description).toContain("<em>italic</em>");
      expect(articles[0].description).toContain(
        '<a href="https://example.com"'
      );
    });
  });

  describe("Complex Reddit Feed", () => {
    it("should handle real-world Reddit RSS structure", async () => {
      const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Reddit r/news</title>
            <item>
              <title>Breaking News: Important Event</title>
              <link>https://www.reddit.com/r/news/comments/abc123/breaking_news/</link>
              <guid>https://www.reddit.com/r/news/comments/abc123/breaking_news/</guid>
              <description>
                &lt;table&gt;&lt;tr&gt;&lt;td&gt;
                &lt;a href="https://example.com/article"&gt;
                &lt;img src="https://preview.redd.it/thumbnail.jpg" alt="thumbnail" /&gt;
                &lt;/a&gt;
                &lt;/td&gt;&lt;td&gt;
                submitted by &lt;a href="https://www.reddit.com/user/testuser"&gt; /u/testuser &lt;/a&gt;
                to &lt;a href="https://www.reddit.com/r/news/"&gt; r/news &lt;/a&gt;
                &lt;br/&gt;
                &lt;a href="https://example.com/article"&gt;[link]&lt;/a&gt;
                &lt;a href="https://www.reddit.com/r/news/comments/abc123/breaking_news/"&gt;[comments]&lt;/a&gt;
                &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;
              </description>
              <pubDate>Mon, 01 Dec 2025 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => feedXml,
      } as Response);

      await fetchSingleFeed(testSourceId, "https://test.example.com/feed", db);

      const articles = await db.select().from(schema.articles);
      expect(articles).toHaveLength(1);
      // Should be empty after removing all Reddit metadata
      expect(articles[0].description).toBe("");
    });
  });
});
