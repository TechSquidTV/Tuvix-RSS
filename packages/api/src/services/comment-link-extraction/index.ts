/**
 * Comment Link Extraction Service
 *
 * Public API for extensible comment link extraction system.
 */

import { CommentLinkRegistry } from "./registry";
import { RssElementExtractor } from "./rss-element-extractor";
import { AtomLinkExtractor } from "./atom-link-extractor";
import { HtmlPatternExtractor } from "./html-pattern-extractor";
import type { ParsedFeedItem } from "./types";

// Create singleton registry with default extractors
const registry = new CommentLinkRegistry();

// Register default extractors (in priority order)
registry.register(new RssElementExtractor());
registry.register(new AtomLinkExtractor());
registry.register(new HtmlPatternExtractor());

/**
 * Extract comment link from a feed item
 *
 * Uses multiple extraction strategies (RSS element, Atom links, HTML patterns)
 * in priority order, returning the first match found.
 *
 * @param item - Feed item to extract comment link from
 * @returns Comment link URL or null if none found
 */
export function extractCommentLink(item: ParsedFeedItem): string | null {
  return registry.extract(item);
}

// Export types and classes for extensibility
export type { CommentLinkExtractor, ExtractedCommentLink } from "./types";
export { CommentLinkRegistry } from "./registry";
export { RssElementExtractor } from "./rss-element-extractor";
export { AtomLinkExtractor } from "./atom-link-extractor";
export { HtmlPatternExtractor } from "./html-pattern-extractor";
