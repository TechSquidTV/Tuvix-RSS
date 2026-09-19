/**
 * Atom Link Extractor
 *
 * Extracts comment links from Atom <link rel="replies"> elements.
 * Standard Atom format for comment links.
 */

import type {
  CommentLinkExtractor,
  ExtractedCommentLink,
  ParsedFeedItem,
} from "./types";

/**
 * Atom Link Extractor
 *
 * Handles extraction from Atom <link rel="replies"> or <link rel="comments">.
 */
export class AtomLinkExtractor implements CommentLinkExtractor {
  readonly priority = 20; // Second priority - standard format

  canHandle(item: ParsedFeedItem): boolean {
    return (
      "links" in item && Array.isArray(item.links) && item.links.length > 0
    );
  }

  extract(item: ParsedFeedItem): ExtractedCommentLink | null {
    if ("links" in item && Array.isArray(item.links)) {
      const commentLink = item.links.find((link) => {
        const rel = link.rel?.toLowerCase();
        return rel === "replies" || rel === "comments" || rel === "discussion";
      });

      if (commentLink?.href) {
        return {
          url: commentLink.href,
          source: "atom-link",
        };
      }
    }
    return null;
  }
}
