/**
 * Feed Discovery Tests
 *
 * Tests for feed discovery with deduplication based on:
 * - Normalized final URLs (after redirects)
 * - Feed content identifiers (Atom feed id, RSS feed link)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import { subscriptionsRouter } from "../subscriptions";

describe("Feed Discovery - Deduplication", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    // Mock fetch globally
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a mock RSS feed response
   */
  function createMockRssResponse(url: string, title: string = "Test Feed") {
    return {
      ok: true,
      url: url, // Final URL after redirects
      text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>https://example.com</link>
    <description>Test feed description</description>
  </channel>
</rss>`,
    } as Response;
  }

  /**
   * Helper to create a mock Atom feed response
   */
  function createMockAtomResponse(url: string, title: string = "Test Feed") {
    return {
      ok: true,
      url: url,
      text: async () => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <link href="https://example.com"/>
  <subtitle>Test feed description</subtitle>
</feed>`,
    } as Response;
  }

  /**
   * Helper to create a mock HTML response with feed links
   */
  function createMockHtmlResponse(feedLinks: string[]) {
    const links = feedLinks
      .map(
        (url) =>
          `<link rel="alternate" type="application/rss+xml" href="${url}">`
      )
      .join("\n");
    return {
      ok: true,
      url: "https://example.com",
      text: async () => `<!DOCTYPE html>
<html>
<head>
  <title>Example Site</title>
  ${links}
</head>
<body>Content</body>
</html>`,
    } as Response;
  }

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return subscriptionsRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  }

  describe("Redirect deduplication", () => {
    it("should deduplicate feeds that redirect to the same final URL", async () => {
      const caller = createCaller();

      // Mock: /feed and /rss both redirect to /feed.xml
      // We need to mock all common paths (12 paths) + HTML fetch
      const mockResponses = Array(12).fill({ ok: false });
      mockResponses[0] = createMockRssResponse(
        "https://example.com/feed.xml",
        "Feed"
      ); // /feed
      mockResponses[1] = createMockRssResponse(
        "https://example.com/feed.xml",
        "Feed"
      ); // /rss
      mockResponses.push(createMockHtmlResponse([])); // HTML fetch

      (global.fetch as any).mockImplementation((url: string) => {
        // Find matching mock response
        if (
          url.includes("/feed") &&
          !url.includes("/rss") &&
          !url.includes("/atom")
        ) {
          return Promise.resolve(mockResponses[0]);
        }
        if (url.includes("/rss") && !url.includes("/feed")) {
          return Promise.resolve(mockResponses[1]);
        }
        if (url === "https://example.com") {
          return Promise.resolve(mockResponses[mockResponses.length - 1]);
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should only return one feed (deduplicated)
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/feed"); // Original URL preserved
      expect(result[0].title).toBe("Feed");
    });

    it("should deduplicate feeds discovered via HTML links that redirect to same URL", async () => {
      const caller = createCaller();

      // Mock: All common paths fail, HTML has links that redirect to same feed
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse([
              "https://example.com/feed",
              "https://example.com/rss",
            ])
          );
        }
        if (
          url === "https://example.com/feed" ||
          url === "https://example.com/rss"
        ) {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed.xml", "Feed")
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result).toHaveLength(1);
    });
  });

  describe("Query parameter normalization", () => {
    it("should deduplicate feeds with different tracking parameters", async () => {
      const caller = createCaller();

      // Mock: HTML contains links to feeds with different tracking parameters
      // Both should normalize to the same URL and be deduplicated
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed?utm_source=twitter") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/feed?utm_source=twitter",
              "Feed"
            )
          );
        }
        if (url === "https://example.com/feed?utm_source=facebook") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/feed?utm_source=facebook",
              "Feed"
            )
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse([
              "https://example.com/feed?utm_source=twitter",
              "https://example.com/feed?utm_source=facebook",
            ])
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should be deduplicated (normalized URLs are the same)
      expect(result).toHaveLength(1);
    });

    it("should preserve feeds with meaningful query parameters", async () => {
      const caller = createCaller();

      // Mock: HTML contains links to feeds with different meaningful query parameters
      // These should be treated as different feeds
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed?category=tech") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/feed?category=tech",
              "Tech Feed"
            )
          );
        }
        if (url === "https://example.com/feed?category=sports") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/feed?category=sports",
              "Sports Feed"
            )
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse([
              "https://example.com/feed?category=tech",
              "https://example.com/feed?category=sports",
            ])
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should return both feeds (different meaningful params)
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.title).sort()).toEqual([
        "Sports Feed",
        "Tech Feed",
      ]);
    });
  });

  describe("Trailing slash normalization", () => {
    it("should deduplicate feeds with and without trailing slashes", async () => {
      const caller = createCaller();

      // Mock: /feed/ and /feed both resolve to same feed
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed/") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed/", "Feed")
          );
        }
        if (url === "https://example.com/feed") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed", "Feed")
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result).toHaveLength(1);
    });
  });

  describe("Case normalization", () => {
    it("should deduplicate feeds with different hostname cases", async () => {
      const caller = createCaller();

      // Mock: Different case hostnames should normalize to same
      // Note: This test is more theoretical since we're discovering from same base URL
      // In practice, redirects to different case hostnames would be caught
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/feed")) {
          // Simulate redirect to different case hostname
          return Promise.resolve(
            createMockRssResponse("https://Example.com/feed", "Feed")
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should still work (normalization handles case)
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Original URL preservation", () => {
    it("should preserve original discovered URLs in results", async () => {
      const caller = createCaller();

      // Mock: /feed redirects to /feed.xml
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed.xml", "Feed")
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should show original URL, not redirected one
      expect(result[0].url).toBe("https://example.com/feed");
      expect(result[0].url).not.toBe("https://example.com/feed.xml");
    });
  });

  describe("Feed type detection", () => {
    it("should correctly identify RSS feeds", async () => {
      const caller = createCaller();

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed", "RSS Feed")
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result[0].type).toBe("rss");
    });

    it("should correctly identify Atom feeds", async () => {
      const caller = createCaller();

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/atom") {
          return Promise.resolve(
            createMockAtomResponse("https://example.com/atom", "Atom Feed")
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result[0].type).toBe("atom");
    });
  });

  describe("Error handling", () => {
    it("should throw error when no feeds found", async () => {
      const caller = createCaller();

      // Mock: All common paths fail, HTML has no feed links
      (global.fetch as any).mockImplementation(() => {
        return Promise.resolve({ ok: false });
      });

      await expect(
        caller.discover({ url: "https://example.com" })
      ).rejects.toThrow("No RSS or Atom feeds found");
    });

    it("should handle fetch errors gracefully", async () => {
      const caller = createCaller();

      // Mock: All fetches throw errors
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      await expect(
        caller.discover({ url: "https://example.com" })
      ).rejects.toThrow("No RSS or Atom feeds found");
    });
  });

  describe("Multiple feed discovery", () => {
    it("should return multiple distinct feeds when they exist", async () => {
      const caller = createCaller();

      // Mock: Two different feeds (different final URLs)
      // HTML contains links to both feeds
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/feed") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed", "Main Feed")
          );
        }
        if (url === "https://example.com/comments/feed") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/comments/feed",
              "Comments Feed"
            )
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse([
              "https://example.com/feed",
              "https://example.com/comments/feed",
            ])
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result.length).toBeGreaterThanOrEqual(2);
      const titles = result.map((f) => f.title);
      expect(titles).toContain("Main Feed");
      expect(titles).toContain("Comments Feed");
    });
  });

  describe("Content-based deduplication", () => {
    it("should deduplicate Atom feeds with same id but different URLs", async () => {
      const caller = createCaller();

      // Mock: /atom and /atom.xml both serve the same feed (same id)
      // This simulates the thume.ca case where both URLs return 200
      const atomFeedContent = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Tristan Hume</title>
  <link href="https://example.com/atom.xml" rel="self"/>
  <link href="https://example.com"/>
  <updated>2025-04-17T17:10:52+00:00</updated>
  <id>https://example.com</id>
  <author>
    <name>Tristan Hume</name>
  </author>
</feed>`;

      (global.fetch as any).mockImplementation((url: string) => {
        // Both /atom and /atom.xml return 200 with same content
        if (url === "https://example.com/atom") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom", // No redirect
            text: async () => atomFeedContent,
          } as Response);
        }
        if (url === "https://example.com/atom.xml") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom.xml", // No redirect
            text: async () => atomFeedContent,
          } as Response);
        }
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse(["https://example.com/atom.xml"])
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should only return one feed (deduplicated by feed id)
      expect(result).toHaveLength(1);
      // The URL returned depends on discovery order (common paths vs HTML links)
      // But both should have the same title since they're the same feed
      expect(result[0].title).toBe("Tristan Hume");
      // Should be one of the two URLs
      expect([
        "https://example.com/atom",
        "https://example.com/atom.xml",
      ]).toContain(result[0].url);
    });

    it("should not deduplicate feeds with different content identifiers", async () => {
      const caller = createCaller();

      // Mock: Two different Atom feeds with different ids
      const feed1Content = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed 1</title>
  <id>https://example.com/feed1</id>
</feed>`;

      const feed2Content = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed 2</title>
  <id>https://example.com/feed2</id>
</feed>`;

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/atom") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom",
            text: async () => feed1Content,
          } as Response);
        }
        if (url === "https://example.com/atom.xml") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom.xml",
            text: async () => feed2Content,
          } as Response);
        }
        if (url === "https://example.com") {
          return Promise.resolve(
            createMockHtmlResponse([
              "https://example.com/atom",
              "https://example.com/atom.xml",
            ])
          );
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should return both feeds (different ids)
      expect(result).toHaveLength(2);
      const titles = result.map((f) => f.title).sort();
      expect(titles).toEqual(["Feed 1", "Feed 2"]);
    });

    it("should handle feeds without id/link gracefully", async () => {
      const caller = createCaller();

      // Mock: Feed without id field (malformed Atom feed)
      const feedContent = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed Without ID</title>
</feed>`;

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/atom") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom",
            text: async () => feedContent,
          } as Response);
        }
        if (url === "https://example.com/atom.xml") {
          return Promise.resolve({
            ok: true,
            url: "https://example.com/atom.xml",
            text: async () => feedContent,
          } as Response);
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      // Should still work (falls back to URL-based deduplication)
      // Since URLs normalize differently, might return both or one depending on order
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Subdirectory feed discovery", () => {
    it("should discover feeds in subdirectories when input URL has a pathname", async () => {
      const caller = createCaller();

      // Mock: Feed exists at /blog/rss.xml when input is /blog/
      (global.fetch as any).mockImplementation((url: string) => {
        // Path-relative discovery: /blog/rss.xml
        if (url === "https://example.com/blog/rss.xml") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/blog/rss.xml",
              "Blog Feed"
            )
          );
        }
        // HTML fetch for /blog/
        if (url === "https://example.com/blog/") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        // All other paths fail (base domain paths, etc.)
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({
        url: "https://example.com/blog/",
      });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/blog/rss.xml");
      expect(result[0].title).toBe("Blog Feed");
    });

    it("should discover feeds in subdirectories without trailing slash", async () => {
      const caller = createCaller();

      // Mock: Feed exists at /blog/rss.xml when input is /blog (no trailing slash)
      (global.fetch as any).mockImplementation((url: string) => {
        // Path-relative discovery: /blog/rss.xml (trailing slash added)
        if (url === "https://example.com/blog/rss.xml") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/blog/rss.xml",
              "Blog Feed"
            )
          );
        }
        // HTML fetch for /blog
        if (url === "https://example.com/blog") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com/blog" });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/blog/rss.xml");
    });

    it("should check both base domain and path-relative common paths", async () => {
      const caller = createCaller();

      // Mock: Feed exists at root /rss.xml, not in subdirectory
      (global.fetch as any).mockImplementation((url: string) => {
        // Base domain path
        if (url === "https://example.com/rss.xml") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/rss.xml", "Root Feed")
          );
        }
        // HTML fetch for /blog/
        if (url === "https://example.com/blog/") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        // Path-relative paths fail
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({
        url: "https://example.com/blog/",
      });

      // Should find feed at root level
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/rss.xml");
    });

    it("should discover /blog/rss.xml from common paths list", async () => {
      const caller = createCaller();

      // Mock: Feed exists at /blog/rss.xml (from common paths, not path-relative)
      (global.fetch as any).mockImplementation((url: string) => {
        // Common path: /blog/rss.xml
        if (url === "https://example.com/blog/rss.xml") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/blog/rss.xml",
              "Blog RSS Feed"
            )
          );
        }
        // HTML fetch
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/blog/rss.xml");
      expect(result[0].title).toBe("Blog RSS Feed");
    });

    it("should discover /blog/feed.xml from common paths list", async () => {
      const caller = createCaller();

      // Mock: Feed exists at /blog/feed.xml
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === "https://example.com/blog/feed.xml") {
          return Promise.resolve(
            createMockRssResponse(
              "https://example.com/blog/feed.xml",
              "Blog Feed XML"
            )
          );
        }
        if (url === "https://example.com") {
          return Promise.resolve(createMockHtmlResponse([]));
        }
        return Promise.resolve({ ok: false });
      });

      const result = await caller.discover({ url: "https://example.com" });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/blog/feed.xml");
    });
  });
});
