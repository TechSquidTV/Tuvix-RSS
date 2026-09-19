/**
 * HTML Pattern Extractor Tests
 *
 * Tests the HTML pattern matching extractor using fake data
 * based on Reddit RSS feed schema.
 */

import { describe, it, expect } from "vitest";
import { HtmlPatternExtractor } from "./html-pattern-extractor";
import type { ParsedFeedItem } from "./types";

describe("HtmlPatternExtractor", () => {
  const extractor = new HtmlPatternExtractor();

  describe("priority", () => {
    it("should have priority 30", () => {
      expect(extractor.priority).toBe(30);
    });
  });

  describe("canHandle", () => {
    it("should return true when item has description field", () => {
      const item: Partial<ParsedFeedItem> = {
        description:
          "<p>Some content with <a href='https://reddit.com/comments'>[comments]</a></p>",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(true);
    });

    it("should return true when item has content field", () => {
      const item: Partial<ParsedFeedItem> = {
        content: "<p>Article content</p>",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(true);
    });

    it("should return true when item has summary field", () => {
      const item: Partial<ParsedFeedItem> = {
        summary: "<p>Article summary</p>",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(true);
    });

    it("should return false when item has no HTML fields", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Test Article",
        link: "https://example.com/article",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(false);
    });

    it("should return false when all HTML fields are empty", () => {
      const item: Partial<ParsedFeedItem> = {
        description: "",
        content: "",
        summary: "",
      };
      expect(extractor.canHandle(item as ParsedFeedItem)).toBe(false);
    });
  });

  describe("extract", () => {
    describe("Reddit [comments] pattern", () => {
      it("should extract comment URL from Reddit style [comments] link", () => {
        // Based on actual Reddit RSS feed schema
        const item: Partial<ParsedFeedItem> = {
          title: "TIL something interesting",
          description:
            '<table><tr><td><a href="https://www.reddit.com/r/todayilearned/comments/abc123/til_something/">[comments]</a></td></tr></table>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://www.reddit.com/r/todayilearned/comments/abc123/til_something/",
          source: "html-pattern",
        });
      });

      it("should handle [comments] with extra whitespace", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<a href="https://reddit.com/comments/123">  [ comments ]  </a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://reddit.com/comments/123",
          source: "html-pattern",
        });
      });

      it("should handle comments without brackets", () => {
        const item: Partial<ParsedFeedItem> = {
          description: '<a href="https://reddit.com/comments/123">comments</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://reddit.com/comments/123",
          source: "html-pattern",
        });
      });
    });

    describe("Plain text patterns", () => {
      it("should extract from 'Comments' link text", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<p>Article text <a href="https://example.com/article/comments">Comments</a></p>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/article/comments",
          source: "html-pattern",
        });
      });

      it("should extract from 'Discussion' link text", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<p>See the <a href="https://forum.example.com/discussion/123">Discussion</a></p>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://forum.example.com/discussion/123",
          source: "html-pattern",
        });
      });

      it("should extract from 'Discuss' link text", () => {
        const item: Partial<ParsedFeedItem> = {
          description: '<a href="https://example.com/discuss">Discuss</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/discuss",
          source: "html-pattern",
        });
      });
    });

    describe("Icon patterns", () => {
      it("should extract from emoji icon + text", () => {
        const item: Partial<ParsedFeedItem> = {
          description: '<a href="https://example.com/comments">💬 Comments</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/comments",
          source: "html-pattern",
        });
      });

      it("should extract from comment text in link", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<a href="https://example.com/article#comments">Leave a comment</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/article#comments",
          source: "html-pattern",
        });
      });
    });

    describe("Content field priority", () => {
      it("should check description first", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<a href="https://example.com/desc-comments">[comments]</a>',
          content:
            '<a href="https://example.com/content-comments">[comments]</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result?.url).toBe("https://example.com/desc-comments");
      });

      it("should fall back to content if description has no match", () => {
        const item: Partial<ParsedFeedItem> = {
          description: "<p>No comment links here</p>",
          content:
            '<a href="https://example.com/content-comments">[comments]</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/content-comments",
          source: "html-pattern",
        });
      });

      it("should fall back to summary if description and content have no match", () => {
        const item: Partial<ParsedFeedItem> = {
          description: "<p>No links</p>",
          content: "<p>Still no links</p>",
          summary:
            '<a href="https://example.com/summary-comments">Comments</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/summary-comments",
          source: "html-pattern",
        });
      });
    });

    describe("Edge cases", () => {
      it("should return null when no comment patterns found", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<p>Article content with <a href="https://example.com">regular links</a></p>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toBeNull();
      });

      it("should handle malformed HTML gracefully", () => {
        // HTML without proper href attribute structure
        const item: Partial<ParsedFeedItem> = {
          description: "<a hrf='broken'>[comments]</a>",
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toBeNull();
      });

      it("should handle links with single quotes", () => {
        const item: Partial<ParsedFeedItem> = {
          description: "<a href='https://example.com/comments'>[comments]</a>",
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/comments",
          source: "html-pattern",
        });
      });

      it("should handle links with additional attributes", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<a class="comment-link" target="_blank" href="https://example.com/comments" data-id="123">Comments</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/comments",
          source: "html-pattern",
        });
      });

      it("should be case-insensitive for link text", () => {
        const item: Partial<ParsedFeedItem> = {
          description: '<a href="https://example.com/comments">COMMENTS</a>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/comments",
          source: "html-pattern",
        });
      });

      it("should handle nested HTML in description", () => {
        const item: Partial<ParsedFeedItem> = {
          description:
            '<div><p>Article content</p><div class="footer"><a href="https://example.com/comments">[comments]</a></div></div>',
        };

        const result = extractor.extract(item as ParsedFeedItem);

        expect(result).toEqual({
          url: "https://example.com/comments",
          source: "html-pattern",
        });
      });
    });
  });
});
