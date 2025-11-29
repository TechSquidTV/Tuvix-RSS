/**
 * RSS Fetcher Integration Test - Hacker News Feed
 *
 * HIGH IMPACT: Tests real-world HN RSS feed parsing with HTML sanitization
 * Uses actual HN feed structure to ensure links are preserved correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseFeed } from "feedsmith";
import { sanitizeHtml } from "@/utils/text-sanitizer";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchSingleFeed } from "../rss-fetcher";

describe("RSS Fetcher - Hacker News Integration", () => {
  let db!: ReturnType<typeof createTestDb>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    db = createTestDb();
    // Store original fetch to restore later
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    cleanupTestDb(db);
    // Restore original fetch to prevent test interference
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should parse and sanitize real HN RSS feed item with comment link", () => {
    // Real HN RSS feed structure (anonymized)
    const hnRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <link>https://news.example.com/</link>
    <description>Links for the intellectually curious, ranked by readers.</description>
    <item>
      <title>Revolutionary New Technology Announced</title>
      <link>https://example.com/article/12345</link>
      <pubDate>Sat, 29 Nov 2025 03:26:01 +0000</pubDate>
      <comments>https://news.example.com/item?id=46084956</comments>
      <description><![CDATA[<a href="https://news.example.com/item?id=46084956">Comments</a>]]></description>
    </item>
  </channel>
</rss>`;

    // Parse the feed
    const { feed } = parseFeed(hnRssFeed);
    expect(feed).toBeDefined();

    // Verify feed structure
    expect("items" in feed).toBe(true);
    const items = "items" in feed ? feed.items : [];
    expect(items).toHaveLength(1);

    const item = items?.[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("No item found");

    // Verify item fields
    if ("title" in item) {
      expect(item.title).toBe("Revolutionary New Technology Announced");
    }
    if ("link" in item) {
      expect(item.link).toBe("https://example.com/article/12345");
    }
    if ("description" in item) {
      const rawDescription = item.description as string;
      expect(rawDescription).toContain("<a href=");
      expect(rawDescription).toContain("Comments");

      // Sanitize the description (this is what happens in the backend)
      const sanitized = sanitizeHtml(rawDescription);

      // Verify sanitization preserves the link
      expect(sanitized).toContain(
        '<a href="https://news.example.com/item?id=46084956"'
      );
      expect(sanitized).toContain("Comments");

      // Verify security attributes are added
      expect(sanitized).toContain('target="_blank"');
      expect(sanitized).toContain('rel="noopener noreferrer"');

      // Verify the link text is preserved
      expect(sanitized).toContain(">Comments</a>");
    }
  });

  it("should handle HN RSS feed with CDATA section properly", () => {
    // Parser will extract content from CDATA
    const cdataContent =
      '<a href="https://news.example.com/item?id=12345">Comments</a>';

    const sanitized = sanitizeHtml(cdataContent);

    // Link should be preserved with security attributes
    expect(sanitized).toContain(
      'href="https://news.example.com/item?id=12345"'
    );
    expect(sanitized).toContain('target="_blank"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(sanitized).toContain("Comments");
  });

  it("should handle HN feed items with both article link and comment link", () => {
    const hnRssFeedMultipleLinks = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <item>
      <title>Amazing Article Title</title>
      <link>https://example.com/blog/post</link>
      <comments>https://news.example.com/item?id=99999</comments>
      <description><![CDATA[<a href="https://news.example.com/item?id=99999">Comments</a>]]></description>
    </item>
  </channel>
</rss>`;

    const { feed } = parseFeed(hnRssFeedMultipleLinks);
    const items = "items" in feed ? feed.items : [];
    const item = items?.[0];
    if (!item) throw new Error("No items found");

    // Verify article link
    if ("link" in item) {
      expect(item.link).toBe("https://example.com/blog/post");
    }

    // Verify comment link in description
    if ("description" in item) {
      const sanitized = sanitizeHtml(item.description as string);
      expect(sanitized).toContain(
        'href="https://news.example.com/item?id=99999"'
      );
      expect(sanitized).toContain("Comments");
    }
  });

  it("should preserve comment links without any XSS vulnerabilities", () => {
    // Attempt to inject XSS through various vectors
    const maliciousDescriptions = [
      "<a href=\"javascript:alert('xss')\">Comments</a>",
      '<a href="https://news.example.com/item?id=123" onclick="alert(\'xss\')">Comments</a>',
      '<script>alert("xss")</script><a href="https://news.example.com/item?id=123">Comments</a>',
      '<a href="data:text/html,<script>alert(1)</script>">Comments</a>',
    ];

    for (const malicious of maliciousDescriptions) {
      const sanitized = sanitizeHtml(malicious);

      // Should not contain any XSS vectors
      expect(sanitized).not.toContain("javascript:");
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("data:");
      expect(sanitized).not.toContain("alert");

      // Should preserve legitimate comment link if it exists
      if (malicious.includes('href="https://news.example.com/item?id=123"')) {
        expect(sanitized).toContain(
          'href="https://news.example.com/item?id=123"'
        );
        expect(sanitized).toContain("Comments");
      }
    }
  });

  it("should handle real-world HN feed variations", () => {
    const variations = [
      // Standard format
      '<a href="https://news.example.com/item?id=12345">Comments</a>',
      // With extra whitespace
      '<a href="https://news.example.com/item?id=12345">  Comments  </a>',
      // With title attribute
      '<a href="https://news.example.com/item?id=12345" title="Discuss on HN">Comments</a>',
      // Multiple words
      '<a href="https://news.example.com/item?id=12345">View Comments</a>',
      // With numbers
      '<a href="https://news.example.com/item?id=12345">42 Comments</a>',
    ];

    for (const variation of variations) {
      const sanitized = sanitizeHtml(variation);

      // All should preserve the link
      expect(sanitized).toContain(
        'href="https://news.example.com/item?id=12345"'
      );
      expect(sanitized).toContain('target="_blank"');
      expect(sanitized).toContain('rel="noopener noreferrer"');

      // Should contain comment-related text
      expect(sanitized.toLowerCase()).toMatch(/comment/);
    }
  });

  it("full integration: HN feed item should be stored with sanitized description", async () => {
    await seedTestUser(db);

    // Create a test source (HN feed)
    const [source] = await db
      .insert(schema.sources)
      .values({
        url: "https://news.example.com/rss",
        title: "Hacker News",
        description: "News aggregator",
      })
      .returning();

    // Mock fetch to return HN RSS feed
    const hnFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <item>
      <title>Revolutionary AI Breakthrough</title>
      <link>https://example.com/ai-breakthrough</link>
      <pubDate>Sat, 29 Nov 2025 03:26:01 +0000</pubDate>
      <comments>https://news.example.com/item?id=46084956</comments>
      <description><![CDATA[<a href="https://news.example.com/item?id=46084956">Comments</a>]]></description>
    </item>
  </channel>
</rss>`;

    globalThis.fetch = async () =>
      new Response(hnFeed, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });

    // Fetch the feed
    const result = await fetchSingleFeed(source.id, source.url, db);

    expect(result.articlesAdded).toBe(1);
    expect(result.articlesSkipped).toBe(0);
    expect(result.sourceUpdated).toBe(true);

    // Verify article was stored with sanitized description
    const articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, source.id));

    expect(articles).toHaveLength(1);

    const article = articles[0];
    expect(article.title).toBe("Revolutionary AI Breakthrough");
    expect(article.link).toBe("https://example.com/ai-breakthrough");

    // CRITICAL: Description should have sanitized HTML with comment link
    expect(article.description).toBeDefined();
    expect(article.description).toContain(
      'href="https://news.example.com/item?id=46084956"'
    );
    expect(article.description).toContain('target="_blank"');
    expect(article.description).toContain('rel="noopener noreferrer"');
    expect(article.description).toContain("Comments");

    // Should NOT contain any unsafe attributes or tags
    expect(article.description).not.toContain("<script>");
    expect(article.description).not.toContain("javascript:");
    expect(article.description).not.toContain("onclick");
  });
});
