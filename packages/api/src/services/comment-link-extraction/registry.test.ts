/**
 * Comment Link Registry Tests
 *
 * Tests the registry orchestration and priority-based execution.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CommentLinkRegistry } from "./registry";
import type {
  CommentLinkExtractor,
  ExtractedCommentLink,
  ParsedFeedItem,
} from "./types";

// Mock extractors for testing
class HighPriorityExtractor implements CommentLinkExtractor {
  readonly priority = 10;

  canHandle(_item: ParsedFeedItem): boolean {
    return "highPriority" in _item;
  }

  extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
    if ("highPriority" in _item) {
      return {
        url: "https://high-priority.com/comments",
        source: "rss-comments-element",
      };
    }
    return null;
  }
}

class MediumPriorityExtractor implements CommentLinkExtractor {
  readonly priority = 20;

  canHandle(_item: ParsedFeedItem): boolean {
    return "mediumPriority" in _item;
  }

  extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
    if ("mediumPriority" in _item) {
      return {
        url: "https://medium-priority.com/comments",
        source: "atom-link",
      };
    }
    return null;
  }
}

class LowPriorityExtractor implements CommentLinkExtractor {
  readonly priority = 30;

  canHandle(_item: ParsedFeedItem): boolean {
    return "lowPriority" in _item;
  }

  extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
    if ("lowPriority" in _item) {
      return {
        url: "https://low-priority.com/comments",
        source: "html-pattern",
      };
    }
    return null;
  }
}

class AlwaysMatchExtractor implements CommentLinkExtractor {
  readonly priority = 40;

  canHandle(_item: ParsedFeedItem): boolean {
    return true;
  }

  extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
    return {
      url: "https://always-match.com/comments",
      source: "url-pattern",
    };
  }
}

describe("CommentLinkRegistry", () => {
  let registry: CommentLinkRegistry;

  beforeEach(() => {
    registry = new CommentLinkRegistry();
  });

  describe("register", () => {
    it("should register an extractor", () => {
      const extractor = new HighPriorityExtractor();
      registry.register(extractor);

      const item = { highPriority: true } as unknown as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBe("https://high-priority.com/comments");
    });

    it("should register multiple extractors", () => {
      registry.register(new HighPriorityExtractor());
      registry.register(new MediumPriorityExtractor());
      registry.register(new LowPriorityExtractor());

      const item = { lowPriority: true } as unknown as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBe("https://low-priority.com/comments");
    });

    it("should sort extractors by priority after registration", () => {
      // Register in reverse priority order
      registry.register(new LowPriorityExtractor());
      registry.register(new HighPriorityExtractor());
      registry.register(new MediumPriorityExtractor());

      // Item matches all extractors - should use highest priority
      const item = {
        highPriority: true,
        mediumPriority: true,
        lowPriority: true,
      } as unknown as ParsedFeedItem;

      const result = registry.extract(item);

      expect(result).toBe("https://high-priority.com/comments");
    });
  });

  describe("extract", () => {
    beforeEach(() => {
      registry.register(new HighPriorityExtractor());
      registry.register(new MediumPriorityExtractor());
      registry.register(new LowPriorityExtractor());
    });

    it("should execute extractors in priority order", () => {
      // Item matches medium and low priority
      const item = {
        mediumPriority: true,
        lowPriority: true,
      } as unknown as ParsedFeedItem;

      const result = registry.extract(item);

      // Should use medium priority (20) not low priority (30)
      expect(result).toBe("https://medium-priority.com/comments");
    });

    it("should return first match found", () => {
      const item = { highPriority: true } as unknown as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBe("https://high-priority.com/comments");
    });

    it("should skip extractors that cannot handle item", () => {
      const item = { lowPriority: true } as unknown as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBe("https://low-priority.com/comments");
    });

    it("should return null when no extractors can handle item", () => {
      const item = { unknown: true } as unknown as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBeNull();
    });

    it("should return null when extractor returns null", () => {
      const item = { title: "Test" } as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBeNull();
    });

    it("should stop after first successful extraction", () => {
      registry.register(new AlwaysMatchExtractor());

      // Even though item matches multiple extractors, should return first match
      const item = {
        highPriority: true,
        mediumPriority: true,
      } as unknown as ParsedFeedItem;

      const result = registry.extract(item);

      // High priority (10) comes before always-match (40)
      expect(result).toBe("https://high-priority.com/comments");
    });
  });

  describe("priority handling", () => {
    it("should respect priority order when registering out of order", () => {
      const extractors = [
        new LowPriorityExtractor(),
        new HighPriorityExtractor(),
        new AlwaysMatchExtractor(),
        new MediumPriorityExtractor(),
      ];

      // Shuffle and register
      extractors.forEach((e) => registry.register(e));

      const item = {
        highPriority: true,
        mediumPriority: true,
        lowPriority: true,
      } as unknown as ParsedFeedItem;

      const result = registry.extract(item);

      // Should still use highest priority (10)
      expect(result).toBe("https://high-priority.com/comments");
    });

    it("should handle extractors with same priority (stable sort)", () => {
      class FirstExtractor implements CommentLinkExtractor {
        readonly priority = 10;
        canHandle(_item: ParsedFeedItem): boolean {
          return true;
        }
        extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
          return { url: "https://first.com", source: "rss-comments-element" };
        }
      }

      class SecondExtractor implements CommentLinkExtractor {
        readonly priority = 10;
        canHandle(_item: ParsedFeedItem): boolean {
          return true;
        }
        extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
          return { url: "https://second.com", source: "atom-link" };
        }
      }

      registry.register(new FirstExtractor());
      registry.register(new SecondExtractor());

      const item = { title: "Test" } as ParsedFeedItem;
      const result = registry.extract(item);

      // Should use first registered extractor when priorities are equal
      expect(result).toBe("https://first.com");
    });
  });

  describe("edge cases", () => {
    it("should handle empty registry", () => {
      const item = { title: "Test" } as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBeNull();
    });

    it("should handle extractor throwing error gracefully", () => {
      class ErrorExtractor implements CommentLinkExtractor {
        readonly priority = 10;
        canHandle(_item: ParsedFeedItem): boolean {
          return true;
        }
        extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
          throw new Error("Extractor error");
        }
      }

      registry.register(new ErrorExtractor());
      registry.register(new AlwaysMatchExtractor());

      const item = { title: "Test" } as ParsedFeedItem;

      // Should catch error and continue to next extractor
      const result = registry.extract(item);

      // AlwaysMatchExtractor should run after ErrorExtractor fails
      expect(result).toBe("https://always-match.com/comments");
    });

    it("should handle canHandle returning false for all extractors", () => {
      class NeverMatchExtractor implements CommentLinkExtractor {
        readonly priority = 10;
        canHandle(_item: ParsedFeedItem): boolean {
          return false;
        }
        extract(_item: ParsedFeedItem): ExtractedCommentLink | null {
          return { url: "https://never.com", source: "html-pattern" };
        }
      }

      registry.register(new NeverMatchExtractor());

      const item = { title: "Test" } as ParsedFeedItem;
      const result = registry.extract(item);

      expect(result).toBeNull();
    });
  });
});
