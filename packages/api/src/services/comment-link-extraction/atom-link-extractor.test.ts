/**
 * Atom Link Extractor Tests
 *
 * Tests the Atom <link rel="replies"> extractor using fake data
 * based on standard Atom feed schema.
 */

import { describe, it, expect } from "vitest";
import { AtomLinkExtractor } from "./atom-link-extractor";
import type { ParsedFeedItem } from "./types";

describe("AtomLinkExtractor", () => {
  const extractor = new AtomLinkExtractor();

  describe("priority", () => {
    it("should have priority 20", () => {
      expect(extractor.priority).toBe(20);
    });
  });

  describe("canHandle", () => {
    it("should return true when item has links array", () => {
      const item: Partial<ParsedFeedItem> = {
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/comments", rel: "replies" },
        ],
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(true);
    });

    it("should return false when item has no links field", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Test Article",
        link: "https://example.com/article",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(false);
    });

    it("should return false when links is not an array", () => {
      const item = {
        links: "not-an-array",
      };
      expect(extractor.canHandle(item as unknown as ParsedFeedItem)).toBe(
        false
      );
    });

    it("should return false when links array is empty", () => {
      const item: Partial<ParsedFeedItem> = {
        links: [],
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(false);
    });
  });

  describe("extract", () => {
    it("should extract comment URL from link with rel='replies'", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Atom Feed Article",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/article/comments", rel: "replies" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/article/comments",
        source: "atom-link",
      });
    });

    it("should extract comment URL from link with rel='comments'", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Atom Feed Article",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/comments", rel: "comments" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/comments",
        source: "atom-link",
      });
    });

    it("should extract comment URL from link with rel='discussion'", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Atom Feed Article",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/discussion", rel: "discussion" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/discussion",
        source: "atom-link",
      });
    });

    it("should return first matching link when multiple comment links exist", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with multiple comment links",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/replies", rel: "replies" },
          { href: "https://example.com/comments", rel: "comments" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/replies",
        source: "atom-link",
      });
    });

    it("should return null when no comment-related links exist", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article without comment links",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/author", rel: "author" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should return null when links array is empty", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with empty links",
        links: [],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should return null when no links field exists", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article without links field",
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle links without href field", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with malformed links",
        links: [{ rel: "replies" } as { href: string; rel: string }],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle links without rel field", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with links missing rel",
        links: [
          { href: "https://example.com/something" } as {
            href: string;
            rel: string;
          },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should be case-insensitive for rel values", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with uppercase rel",
        links: [
          { href: "https://example.com/article", rel: "ALTERNATE" },
          { href: "https://example.com/comments", rel: "REPLIES" },
        ],
      };

      const result = extractor.extract(item as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/comments",
        source: "atom-link",
      });
    });
  });
});
