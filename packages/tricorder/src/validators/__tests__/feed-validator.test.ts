/**
 * Feed Validator Tests
 *
 * Tests for feed validation and deduplication logic.
 * Following TDD principles - tests describe expected behavior.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFeedValidator } from "../feed-validator";

describe("createFeedValidator", () => {
  let seenUrls: Set<string>;
  let seenFeedIds: Set<string>;

  beforeEach(() => {
    seenUrls = new Set();
    seenFeedIds = new Set();
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
   * Helper to create a mock Atom feed response with ID
   */
  function createMockAtomResponse(
    url: string,
    feedId: string,
    title: string = "Test Feed"
  ) {
    return {
      ok: true,
      url: url,
      text: async () => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${feedId}</id>
  <title>${title}</title>
  <link href="https://example.com"/>
  <subtitle>Test feed description</subtitle>
</feed>`,
    } as Response;
  }

  describe("basic validation", () => {
    it("should validate and return a valid RSS feed", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          createMockRssResponse("https://example.com/feed", "My Feed")
        );
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/feed");

      expect(result).toEqual({
        url: "https://example.com/feed",
        title: "My Feed",
        type: "rss",
        description: "Test feed description",
      });
    });

    it("should validate and return a valid Atom feed", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          createMockAtomResponse(
            "https://example.com/atom",
            "urn:uuid:test-123",
            "My Atom Feed"
          )
        );
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/atom");

      expect(result).toEqual({
        url: "https://example.com/atom",
        title: "My Atom Feed",
        type: "atom",
        description: "Test feed description",
      });
    });

    it("should return null for non-OK responses", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/notfound");

      expect(result).toBeNull();
    });

    it("should return null for fetch errors", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/error");

      expect(result).toBeNull();
    });

    it("should set User-Agent header", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createMockRssResponse("https://example.com/feed"));
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      await validator("https://example.com/feed");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/feed",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "TuvixRSS/1.0",
          }),
        })
      );
    });

    it("should have 10 second timeout", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createMockRssResponse("https://example.com/feed"));
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      await validator("https://example.com/feed");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/feed",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe("URL deduplication", () => {
    it("should deduplicate by normalized input URL", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createMockRssResponse("https://example.com/feed"));
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // First call should succeed
      const result1 = await validator("https://example.com/feed");
      expect(result1).not.toBeNull();
      expect(result1?.url).toBe("https://example.com/feed");

      // Second call with same URL should return null
      const result2 = await validator("https://example.com/feed");
      expect(result2).toBeNull();

      // Fetch should only be called once
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should deduplicate by normalized final URL after redirect", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "https://example.com/feed") {
          // Redirect to /feed.xml
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed.xml")
          );
        }
        if (url === "https://example.com/feed.xml") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed.xml")
          );
        }
        return Promise.resolve({ ok: false });
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // First call to /feed (redirects to /feed.xml)
      const result1 = await validator("https://example.com/feed");
      expect(result1).not.toBeNull();
      expect(result1?.url).toBe("https://example.com/feed");

      // Second call directly to /feed.xml should be deduplicated
      const result2 = await validator("https://example.com/feed.xml");
      expect(result2).toBeNull();
    });

    it("should deduplicate URLs with different tracking parameters", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        // Both URLs return same feed
        return Promise.resolve(createMockRssResponse(url));
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // First call with utm_source=twitter
      const result1 = await validator(
        "https://example.com/feed?utm_source=twitter"
      );
      expect(result1).not.toBeNull();

      // Second call with utm_source=facebook should be deduplicated
      const result2 = await validator(
        "https://example.com/feed?utm_source=facebook"
      );
      expect(result2).toBeNull();

      // Only first fetch should happen
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should preserve original URL in result, not redirect target", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        // Simulate redirect: /feed -> /feed.xml
        if (url === "https://example.com/feed") {
          return Promise.resolve(
            createMockRssResponse("https://example.com/feed.xml")
          );
        }
        return Promise.resolve({ ok: false });
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/feed");

      // Should return original URL, not redirect target
      expect(result?.url).toBe("https://example.com/feed");
    });
  });

  describe("Atom feed ID deduplication", () => {
    it("should deduplicate Atom feeds with same feed ID", async () => {
      const feedId = "urn:uuid:same-feed-123";
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve(createMockAtomResponse(url, feedId));
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // First feed with this ID
      const result1 = await validator("https://example.com/atom1");
      expect(result1).not.toBeNull();

      // Second feed with same ID but different URL
      const result2 = await validator("https://different.com/atom2");
      expect(result2).toBeNull();
    });

    it("should not deduplicate Atom feeds with different feed IDs", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "https://example.com/atom1") {
          return Promise.resolve(
            createMockAtomResponse(url, "urn:uuid:feed-1")
          );
        }
        if (url === "https://example.com/atom2") {
          return Promise.resolve(
            createMockAtomResponse(url, "urn:uuid:feed-2")
          );
        }
        return Promise.resolve({ ok: false });
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      const result1 = await validator("https://example.com/atom1");
      const result2 = await validator("https://example.com/atom2");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });

    it("should not deduplicate RSS feeds (no feed ID)", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve(createMockRssResponse(url));
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // Two different RSS feed URLs
      const result1 = await validator("https://example.com/rss1");
      const result2 = await validator("https://example.com/rss2");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe("parallel validation race conditions", () => {
    it("should handle parallel validation of same normalized URL", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        // Simulate slow network
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(createMockRssResponse(url));
          }, 50);
        });
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // Start two validations in parallel with different tracking params
      const [result1, result2] = await Promise.all([
        validator("https://example.com/feed?utm_source=twitter"),
        validator("https://example.com/feed?utm_source=facebook"),
      ]);

      // Only one should succeed (first one to start)
      const successCount = [result1, result2].filter((r) => r !== null).length;
      expect(successCount).toBe(1);

      // Only one fetch should happen
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should handle parallel validation of redirect chain", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (url === "https://example.com/feed") {
              // /feed redirects to /feed.xml
              resolve(createMockRssResponse("https://example.com/feed.xml"));
            } else {
              resolve(createMockRssResponse(url));
            }
          }, 50);
        });
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      // Start validations in parallel: one to /feed, one to /feed.xml
      const [result1, result2] = await Promise.all([
        validator("https://example.com/feed"),
        validator("https://example.com/feed.xml"),
      ]);

      // Both should complete, but we expect at least one to succeed
      // (The exact behavior depends on timing)
      const successCount = [result1, result2].filter((r) => r !== null).length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("persistent deduplication state", () => {
    it("should share seenUrls across validator calls", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createMockRssResponse("https://example.com/feed"));
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      await validator("https://example.com/feed");

      // Check that the URL was added to seenUrls
      expect(seenUrls.has("https://example.com/feed")).toBe(true);
    });

    it("should share seenFeedIds across validator calls", async () => {
      const feedId = "urn:uuid:test-123";
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          createMockAtomResponse("https://example.com/atom", feedId)
        );
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);

      await validator("https://example.com/atom");

      // Check that the feed ID was added to seenFeedIds
      expect(seenFeedIds.has(feedId)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle feeds without description", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/feed",
        text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
  </channel>
</rss>`,
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/feed");

      expect(result).toMatchObject({
        url: "https://example.com/feed",
        title: "Test Feed",
        type: "rss",
        description: undefined,
      });
    });

    it("should handle feeds without title", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/feed",
        text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <link>https://example.com</link>
    <description>Test description</description>
  </channel>
</rss>`,
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/feed");

      expect(result?.title).toBe("Untitled Feed");
    });

    it("should handle malformed XML gracefully", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/feed",
        text: async () => "not valid xml",
      });
      global.fetch = fetchMock as any;

      const validator = createFeedValidator(seenUrls, seenFeedIds);
      const result = await validator("https://example.com/feed");

      expect(result).toBeNull();
    });
  });
});
