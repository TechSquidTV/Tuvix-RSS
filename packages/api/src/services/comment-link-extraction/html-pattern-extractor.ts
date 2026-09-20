/**
 * HTML Pattern Extractor
 *
 * Extracts comment links by parsing HTML content for links with
 * comment-related text (e.g., "[comments]", "Comments").
 * Used by Reddit and feeds that embed comment links in description.
 *
 * Current Implementation:
 * - Supports English-language patterns (comments, discussion, discuss)
 * - Handles common emoji indicators (💬, 🗨️)
 * - Works with standard HTML attribute quoting
 *
 * Known Limitations:
 * - Does not handle internationalized text (non-English feeds)
 * - Does not decode complex HTML entities in link text
 * - Pattern matching is optimized for common English feeds
 *
 * Extensibility:
 * To support additional languages or patterns, create a new CommentLinkExtractor
 * implementation and register it with the CommentLinkRegistry.
 */

import type {
  CommentLinkExtractor,
  ExtractedCommentLink,
  ParsedFeedItem,
} from "./types";

/**
 * HTML Pattern Extractor
 *
 * Handles extraction by parsing HTML content for comment link patterns.
 */
export class HtmlPatternExtractor implements CommentLinkExtractor {
  readonly priority = 30; // Third priority - pattern matching

  canHandle(item: ParsedFeedItem): boolean {
    const hasDescription = "description" in item && item.description;
    const hasContent = "content" in item && item.content;
    const hasSummary = "summary" in item && item.summary;
    return !!(hasDescription || hasContent || hasSummary);
  }

  extract(item: ParsedFeedItem): ExtractedCommentLink | null {
    // Try each field in priority order: description -> content -> summary
    const htmlFields = [
      "description" in item ? item.description : "",
      "content" in item ? item.content : "",
      "summary" in item ? item.summary : "",
    ];

    // Pattern to match links with comment-related text
    // Matches: <a href="URL">[comments]</a>, <a href="URL">Comments</a>, etc.
    const patterns = [
      // [comments] format (Reddit)
      /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*?>\s*\[?\s*comments?\s*\]?\s*<\/a>/i,
      // Plain "Comments" or "Discussion" text
      /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*?>\s*(?:comments?|discussion|discuss)\s*<\/a>/i,
      // Icon + text patterns (some feeds use this)
      /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*?>[^<]*(?:💬|🗨️|comment|discussion)/i,
    ];

    // Try each HTML field
    for (const htmlContent of htmlFields) {
      // Type guard: ensure htmlContent is a string
      if (!htmlContent || typeof htmlContent !== "string") {
        continue;
      }

      // Try each pattern
      for (const pattern of patterns) {
        const match = htmlContent.match(pattern);
        if (match?.[1]) {
          return {
            url: match[1],
            source: "html-pattern",
          };
        }
      }
    }

    return null;
  }
}
