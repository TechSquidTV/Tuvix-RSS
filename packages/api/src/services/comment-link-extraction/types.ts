/**
 * Comment Link Extraction Types
 *
 * Types and interfaces for the extensible comment link extraction system.
 */

import type { ParsedFeedItem } from "@api/types/feed";
export type { ParsedFeedItem } from "@api/types/feed";

/**
 * Extracted comment link result
 */
export interface ExtractedCommentLink {
  /** URL to comments/discussion page */
  url: string;
  /** Source of the extraction (for debugging/analytics) */
  source: "rss-comments-element" | "atom-link" | "html-pattern" | "url-pattern";
}

/**
 * Comment link extractor interface for extensible extraction.
 *
 * Each extractor implements this interface to handle extraction for specific
 * feed formats or patterns (e.g., RSS comments element, Atom links, HTML parsing).
 */
export interface CommentLinkExtractor {
  /**
   * Check if this extractor can handle the given feed item.
   *
   * @param item - The feed item to check
   * @returns True if this extractor can handle the item
   */
  canHandle(item: ParsedFeedItem): boolean;

  /**
   * Extract comment link from the given feed item.
   *
   * @param item - The feed item to extract from
   * @returns Extracted comment link, or null if none found
   */
  extract(item: ParsedFeedItem): ExtractedCommentLink | null;

  /**
   * Execution priority (lower = higher priority).
   * Extractors with lower priority run first.
   */
  priority: number;
}
