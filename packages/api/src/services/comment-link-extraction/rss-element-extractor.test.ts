/**
 * RSS Element Extractor Tests
 *
 * Tests the RSS <comments> element extractor using fake data
 * based on Hacker News RSS feed schema.
 */

import { describe, it, expect } from "vitest";
import { RssElementExtractor } from "./rss-element-extractor";
import type { ParsedFeedItem } from "./types";

describe("RssElementExtractor", () => {
  const extractor = new RssElementExtractor();

  describe("priority", () => {
    it("should have priority 10", () => {
      expect(extractor.priority).toBe(10);
    });
  });

  describe("canHandle", () => {
    it("should return true when item has comments field", () => {
      const item: Partial<ParsedFeedItem> = {
        comments: "https://news.ycombinator.com/item?id=12345",
      };
      expect(extractor.canHandle(item as any as ParsedFeedItem)).toBe(true);
    });

    it("should return false when item has no comments field", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Test Article",
        link: "https://example.com/article",
      };
      expect(extractor.canHandle(item as any as ParsedFeedItem)).toBe(false);
    });

    it("should return false when comments field is empty", () => {
      const item: Partial<ParsedFeedItem> = {
        comments: "",
      };
      expect(extractor.canHandle(item as any as ParsedFeedItem)).toBe(false);
    });

    it("should return false when comments field is not a string", () => {
      const item = {
        comments: 12345,
      };
      expect(
        extractor.canHandle(item as unknown as any as ParsedFeedItem)
      ).toBe(false);
    });
  });

  describe("extract", () => {
    it("should extract comment URL from Hacker News style feed item", () => {
      // Based on actual HN RSS feed schema
      const item: Partial<ParsedFeedItem> = {
        title: "Show HN: My new project",
        link: "https://example.com/project",
        comments: "https://news.ycombinator.com/item?id=12345",
        description: "Check out this cool project I built",
      };

      const result = extractor.extract(item as any as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://news.ycombinator.com/item?id=12345",
        source: "rss-comments-element",
      });
    });

    it("should extract comment URL from WordPress style feed item", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Blog Post Title",
        link: "https://blog.example.com/post",
        comments: "https://blog.example.com/post#comments",
        description: "Post content here",
      };

      const result = extractor.extract(item as any as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://blog.example.com/post#comments",
        source: "rss-comments-element",
      });
    });

    it("should return null when no comments field exists", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article without comments",
        link: "https://example.com/article",
      };

      const result = extractor.extract(item as any as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should return null when comments field is empty", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article with empty comments",
        link: "https://example.com/article",
        comments: "",
      };

      const result = extractor.extract(item as any as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle feed items with various additional fields", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Complex Feed Item",
        link: "https://example.com/article",
        comments: "https://example.com/comments",
        pubDate: "2024-01-01T00:00:00Z",
        description: "<p>Article content</p>",
      };

      const result = extractor.extract(item as any as ParsedFeedItem);

      expect(result).toEqual({
        url: "https://example.com/comments",
        source: "rss-comments-element",
      });
    });
  });
});
