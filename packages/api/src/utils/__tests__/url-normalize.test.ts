/**
 * URL Normalization Utility Tests
 *
 * Tests for the normalizeFeedUrl function used in feed discovery deduplication
 */

import { describe, it, expect } from "vitest";
import { normalizeFeedUrl } from "../url-normalize";

describe("normalizeFeedUrl", () => {
  describe("Basic normalization", () => {
    it("should normalize hostname to lowercase", () => {
      expect(normalizeFeedUrl("https://Example.com/feed")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://EXAMPLE.COM/feed")).toBe(
        "https://example.com/feed"
      );
    });

    it("should remove trailing slashes from pathname", () => {
      expect(normalizeFeedUrl("https://example.com/feed/")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/blog/feed/")).toBe(
        "https://example.com/blog/feed"
      );
    });

    it("should preserve root path trailing slash", () => {
      expect(normalizeFeedUrl("https://example.com/")).toBe(
        "https://example.com/"
      );
    });

    it("should preserve port numbers", () => {
      expect(normalizeFeedUrl("https://example.com:8080/feed")).toBe(
        "https://example.com:8080/feed"
      );
    });

    it("should preserve protocol", () => {
      expect(normalizeFeedUrl("http://example.com/feed")).toBe(
        "http://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed")).toBe(
        "https://example.com/feed"
      );
    });
  });

  describe("Query parameter handling", () => {
    it("should remove UTM tracking parameters", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?utm_source=twitter")
      ).toBe("https://example.com/feed");
      expect(
        normalizeFeedUrl(
          "https://example.com/feed?utm_source=twitter&utm_medium=social"
        )
      ).toBe("https://example.com/feed");
      expect(
        normalizeFeedUrl(
          "https://example.com/feed?utm_source=twitter&utm_campaign=test&utm_term=keyword&utm_content=ad"
        )
      ).toBe("https://example.com/feed");
    });

    it("should remove social media tracking parameters", () => {
      expect(normalizeFeedUrl("https://example.com/feed?ref=twitter")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed?source=facebook")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed?fbclid=123")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed?gclid=456")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed?gclsrc=789")).toBe(
        "https://example.com/feed"
      );
    });

    it("should remove Google Analytics parameters", () => {
      expect(normalizeFeedUrl("https://example.com/feed?_ga=GA1.2.123")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://example.com/feed?_gid=GA1.2.456")).toBe(
        "https://example.com/feed"
      );
    });

    it("should preserve meaningful query parameters", () => {
      expect(normalizeFeedUrl("https://example.com/feed?category=tech")).toBe(
        "https://example.com/feed?category=tech"
      );
      expect(
        normalizeFeedUrl("https://example.com/feed?category=tech&tag=news")
      ).toBe("https://example.com/feed?category=tech&tag=news");
    });

    it("should sort remaining query parameters alphabetically", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?zebra=1&apple=2&banana=3")
      ).toBe("https://example.com/feed?apple=2&banana=3&zebra=1");
    });

    it("should remove tracking params but keep meaningful ones", () => {
      expect(
        normalizeFeedUrl(
          "https://example.com/feed?category=tech&utm_source=twitter&tag=news"
        )
      ).toBe("https://example.com/feed?category=tech&tag=news");
    });

    it("should handle case-insensitive tracking parameter names", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?UTM_SOURCE=twitter")
      ).toBe("https://example.com/feed");
      expect(
        normalizeFeedUrl("https://example.com/feed?Utm_Source=twitter")
      ).toBe("https://example.com/feed");
    });
  });

  describe("Edge cases", () => {
    it("should handle invalid URLs gracefully", () => {
      const invalidUrl = "not-a-valid-url";
      expect(normalizeFeedUrl(invalidUrl)).toBe(invalidUrl);
    });

    it("should handle URLs with fragments", () => {
      expect(normalizeFeedUrl("https://example.com/feed#section")).toBe(
        "https://example.com/feed#section"
      );
    });

    it("should handle URLs with empty query strings", () => {
      expect(normalizeFeedUrl("https://example.com/feed?")).toBe(
        "https://example.com/feed"
      );
    });

    it("should handle URLs with multiple slashes in path", () => {
      expect(normalizeFeedUrl("https://example.com/blog//feed")).toBe(
        "https://example.com/blog//feed"
      );
    });

    it("should handle URLs with encoded characters", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?category=tech%20news")
      ).toBe("https://example.com/feed?category=tech%20news");
    });

    it("should handle complex URLs with all normalization aspects", () => {
      expect(
        normalizeFeedUrl(
          "https://Example.com/feed/?category=tech&utm_source=twitter&tag=news&utm_medium=social"
        )
      ).toBe("https://example.com/feed?category=tech&tag=news");
    });
  });
});
