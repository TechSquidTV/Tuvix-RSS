/**
 * URL Normalization Tests
 *
 * Tests for URL normalization used in feed deduplication.
 * Following TDD principles - tests describe expected behavior.
 */

import { describe, it, expect } from "vitest";
import { normalizeFeedUrl } from "../url-normalize";

describe("normalizeFeedUrl", () => {
  describe("hostname normalization", () => {
    it("should convert hostname to lowercase", () => {
      expect(normalizeFeedUrl("https://Example.COM/feed")).toBe(
        "https://example.com/feed"
      );
      expect(normalizeFeedUrl("https://EXAMPLE.COM/FEED")).toBe(
        "https://example.com/FEED"
      );
    });

    it("should preserve pathname case", () => {
      expect(normalizeFeedUrl("https://example.com/Feed")).toBe(
        "https://example.com/Feed"
      );
    });
  });

  describe("trailing slash normalization", () => {
    it("should remove trailing slash from pathname", () => {
      expect(normalizeFeedUrl("https://example.com/feed/")).toBe(
        "https://example.com/feed"
      );
    });

    it("should preserve root path slash", () => {
      expect(normalizeFeedUrl("https://example.com/")).toBe(
        "https://example.com/"
      );
    });

    it("should handle paths without trailing slash", () => {
      expect(normalizeFeedUrl("https://example.com/feed")).toBe(
        "https://example.com/feed"
      );
    });
  });

  describe("tracking parameter removal", () => {
    it("should remove utm_source parameter", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?utm_source=twitter")
      ).toBe("https://example.com/feed");
    });

    it("should remove all UTM parameters", () => {
      const url =
        "https://example.com/feed?utm_source=twitter&utm_medium=social&utm_campaign=spring";
      expect(normalizeFeedUrl(url)).toBe("https://example.com/feed");
    });

    it("should remove fbclid parameter", () => {
      expect(normalizeFeedUrl("https://example.com/feed?fbclid=abc123")).toBe(
        "https://example.com/feed"
      );
    });

    it("should remove gclid parameter", () => {
      expect(normalizeFeedUrl("https://example.com/feed?gclid=xyz789")).toBe(
        "https://example.com/feed"
      );
    });

    it("should remove ref parameter", () => {
      expect(normalizeFeedUrl("https://example.com/feed?ref=homepage")).toBe(
        "https://example.com/feed"
      );
    });

    it("should be case-insensitive for tracking parameters", () => {
      expect(
        normalizeFeedUrl("https://example.com/feed?UTM_SOURCE=twitter")
      ).toBe("https://example.com/feed");
    });
  });

  describe("meaningful parameter preservation", () => {
    it("should preserve non-tracking query parameters", () => {
      expect(normalizeFeedUrl("https://example.com/feed?category=tech")).toBe(
        "https://example.com/feed?category=tech"
      );
    });

    it("should preserve multiple meaningful parameters", () => {
      const url = "https://example.com/feed?category=tech&page=2";
      const normalized = normalizeFeedUrl(url);
      // Parameters should be sorted alphabetically
      expect(normalized).toBe("https://example.com/feed?category=tech&page=2");
    });

    it("should sort parameters alphabetically", () => {
      const url = "https://example.com/feed?page=2&category=tech";
      expect(normalizeFeedUrl(url)).toBe(
        "https://example.com/feed?category=tech&page=2"
      );
    });
  });

  describe("mixed parameter handling", () => {
    it("should remove tracking params and preserve meaningful params", () => {
      const url =
        "https://example.com/feed?category=tech&utm_source=twitter&page=2";
      expect(normalizeFeedUrl(url)).toBe(
        "https://example.com/feed?category=tech&page=2"
      );
    });

    it("should handle multiple tracking params with meaningful params", () => {
      const url =
        "https://example.com/feed?utm_source=fb&category=tech&utm_medium=social&page=2&ref=home";
      expect(normalizeFeedUrl(url)).toBe(
        "https://example.com/feed?category=tech&page=2"
      );
    });
  });

  describe("complex URL scenarios", () => {
    it("should handle URLs with fragments", () => {
      const url = "https://example.com/feed?utm_source=twitter#section";
      // Fragment should be preserved
      expect(normalizeFeedUrl(url)).toBe("https://example.com/feed#section");
    });

    it("should normalize complete URL with all features", () => {
      const url =
        "https://Example.COM/Feed/?category=tech&utm_source=twitter&page=2";
      expect(normalizeFeedUrl(url)).toBe(
        "https://example.com/Feed?category=tech&page=2"
      );
    });

    it("should handle encoded parameters correctly", () => {
      const url = "https://example.com/feed?category=tech%20news";
      expect(normalizeFeedUrl(url)).toBe(
        "https://example.com/feed?category=tech%20news"
      );
    });
  });

  describe("edge cases", () => {
    it("should return original URL if parsing fails", () => {
      const invalidUrl = "not-a-valid-url";
      expect(normalizeFeedUrl(invalidUrl)).toBe(invalidUrl);
    });

    it("should handle URLs with ports", () => {
      expect(normalizeFeedUrl("https://example.com:8080/feed")).toBe(
        "https://example.com:8080/feed"
      );
    });

    it("should handle URLs with authentication", () => {
      expect(normalizeFeedUrl("https://user:pass@example.com/feed")).toBe(
        "https://user:pass@example.com/feed"
      );
    });

    it("should handle empty query string", () => {
      expect(normalizeFeedUrl("https://example.com/feed?")).toBe(
        "https://example.com/feed"
      );
    });
  });

  describe("real-world examples", () => {
    it("should deduplicate Reddit feeds shared via different sources", () => {
      const twitterUrl =
        "https://www.reddit.com/r/programming.rss?utm_source=twitter";
      const facebookUrl =
        "https://www.reddit.com/r/programming.rss?utm_source=facebook";

      const normalized1 = normalizeFeedUrl(twitterUrl);
      const normalized2 = normalizeFeedUrl(facebookUrl);

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe("https://www.reddit.com/r/programming.rss");
    });

    it("should deduplicate with and without www", () => {
      // Note: This test shows current behavior - www is NOT normalized
      // This is intentional as www.example.com and example.com may serve different content
      const url1 = "https://www.example.com/feed";
      const url2 = "https://example.com/feed";

      expect(normalizeFeedUrl(url1)).toBe("https://www.example.com/feed");
      expect(normalizeFeedUrl(url2)).toBe("https://example.com/feed");
      expect(normalizeFeedUrl(url1)).not.toBe(normalizeFeedUrl(url2));
    });

    it("should handle Google Analytics parameters", () => {
      const url = "https://example.com/feed?_ga=abc123&_gid=xyz789";
      expect(normalizeFeedUrl(url)).toBe("https://example.com/feed");
    });
  });
});
