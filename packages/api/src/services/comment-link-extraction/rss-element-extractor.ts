/**
 * RSS Comments Element Extractor
 *
 * Extracts comment links from explicit RSS <comments> elements.
 * Used by Hacker News, WordPress, and some other RSS feeds.
 */

import type {
  CommentLinkExtractor,
  ExtractedCommentLink,
  ParsedFeedItem,
} from "./types";

/**
 * RSS Element Extractor
 *
 * Handles extraction from RSS <comments> element (highest priority).
 */
export class RssElementExtractor implements CommentLinkExtractor {
  readonly priority = 10; // Highest priority - explicit element

  canHandle(item: ParsedFeedItem): boolean {
    return (
      "comments" in item &&
      typeof item.comments === "string" &&
      item.comments.length > 0
    );
  }

  extract(item: ParsedFeedItem): ExtractedCommentLink | null {
    if ("comments" in item && item.comments) {
      return {
        url: item.comments,
        source: "rss-comments-element",
      };
    }
    return null;
  }
}
